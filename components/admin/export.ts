import type { StandingsResponse } from "@/lib/schemas/api";

/**
 * Results export (PRD §9.2).
 *
 * The point of this platform is that the spreadsheet stopped being the source of truth. So
 * the export is deliberately **one-way**: it is generated from the standings the scoring
 * engine produced, and nothing anywhere reads a spreadsheet back in. If a file here ever
 * becomes an input, the manual-reconciliation problem is back.
 */

export interface ExportRow {
  readonly division: string;
  readonly rank: number;
  readonly tied: boolean;
  readonly displayName: string;
  readonly score: number;
  readonly penaltyMinutes: number;
}

export const EXPORT_HEADERS = [
  "Division",
  "Rank",
  "Tied",
  "Name",
  "Score",
  "Penalty minutes",
] as const;

export function standingsToRows(standings: StandingsResponse): readonly ExportRow[] {
  return standings.divisions.flatMap((division) =>
    division.rows.map((row) => ({
      division: division.name,
      rank: row.rank,
      tied: row.isTied,
      displayName: row.displayName,
      score: row.score,
      penaltyMinutes: row.penaltyMinutes,
    })),
  );
}

/**
 * Display names are student-supplied. A name beginning `=`, `+`, `-` or `@` is executed as
 * a formula the moment the file is opened in Excel or Sheets — a real injection route into
 * the faculty sponsor's laptop, from a text box a fifteen-year-old controls. Prefixing with
 * an apostrophe forces it to text.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number | boolean): string {
  const raw =
    typeof value === "string" ? neutralizeFormula(value) : typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export function toCsv(rows: readonly ExportRow[]): string {
  const lines = [
    EXPORT_HEADERS.map((h) => csvCell(h)).join(","),
    ...rows.map((row) =>
      [row.division, row.rank, row.tied, row.displayName, row.score, row.penaltyMinutes]
        .map((cell) => csvCell(cell))
        .join(","),
    ),
  ];
  // CRLF and a BOM: Excel on Windows misreads UTF-8 without one, and the results are read
  // by whoever has a laptop, not by whoever has the right laptop.
  return `﻿${lines.join("\r\n")}\r\n`;
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index: number): string {
  let name = "";
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

function sheetXml(rows: readonly (readonly (string | number)[])[]): string {
  const body = rows
    .map((cells, rowIndex) => {
      const inner = cells
        .map((cell, cellIndex) => {
          const ref = `${columnName(cellIndex)}${rowIndex + 1}`;
          if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
            neutralizeFormula(cell),
          )}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${inner}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Standings" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>`;

// --- a minimal STORED (uncompressed) zip writer ------------------------------
//
// `package.json` is orchestrator-owned and frozen, so a zip library cannot be added from
// here. Stored entries are a valid zip: method 0, no deflate stream, CRC-32 per entry.
// The files are a few kilobytes of XML, so compression buys nothing worth a dependency.

const CRC_TABLE: readonly number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[((crc ^ byte) & 0xff)] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

function writeUint32(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function writeUint16(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

/** Fixed 1980-01-01 00:00 so the same standings always produce byte-identical bytes. */
const DOS_TIME = 0;
const DOS_DATE = 33;

function zipStore(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> {
  const out: number[] = [];
  const directory: number[] = [];
  const encoder = new TextEncoder();

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const offset = out.length;

    writeUint32(out, 0x04034b50);
    writeUint16(out, 20);
    writeUint16(out, 0);
    writeUint16(out, 0); // stored
    writeUint16(out, DOS_TIME);
    writeUint16(out, DOS_DATE);
    writeUint32(out, crc);
    writeUint32(out, entry.data.length);
    writeUint32(out, entry.data.length);
    writeUint16(out, nameBytes.length);
    writeUint16(out, 0);
    for (const b of nameBytes) out.push(b);
    for (const b of entry.data) out.push(b);

    writeUint32(directory, 0x02014b50);
    writeUint16(directory, 20);
    writeUint16(directory, 20);
    writeUint16(directory, 0);
    writeUint16(directory, 0);
    writeUint16(directory, DOS_TIME);
    writeUint16(directory, DOS_DATE);
    writeUint32(directory, crc);
    writeUint32(directory, entry.data.length);
    writeUint32(directory, entry.data.length);
    writeUint16(directory, nameBytes.length);
    writeUint16(directory, 0);
    writeUint16(directory, 0);
    writeUint16(directory, 0);
    writeUint16(directory, 0);
    writeUint32(directory, 0);
    writeUint32(directory, offset);
    for (const b of nameBytes) directory.push(b);
  }

  const directoryOffset = out.length;
  for (const b of directory) out.push(b);

  writeUint32(out, 0x06054b50);
  writeUint16(out, 0);
  writeUint16(out, 0);
  writeUint16(out, entries.length);
  writeUint16(out, entries.length);
  writeUint32(out, directory.length);
  writeUint32(out, directoryOffset);
  writeUint16(out, 0);

  return Uint8Array.from(out);
}

export function toXlsx(rows: readonly ExportRow[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const grid: (string | number)[][] = [
    [...EXPORT_HEADERS],
    ...rows.map((row) => [
      row.division,
      row.rank,
      row.tied ? "yes" : "no",
      row.displayName,
      row.score,
      row.penaltyMinutes,
    ]),
  ];

  return zipStore([
    { name: "[Content_Types].xml", data: encoder.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: encoder.encode(ROOT_RELS) },
    { name: "xl/workbook.xml", data: encoder.encode(WORKBOOK) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(WORKBOOK_RELS) },
    { name: "xl/styles.xml", data: encoder.encode(STYLES) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheetXml(grid)) },
  ]);
}

/** Browser-only. Nothing here touches the network — the night has no internet. */
export function downloadBlob(filename: string, data: BlobPart, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function safeFilename(contestName: string, extension: string): string {
  const stem = contestName.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `${stem === "" ? "standings" : stem}-standings.${extension}`;
}
