/**
 * Presentation rules for an authored problem statement.
 *
 * Pure string work, in `lib/` rather than beside the component, because that is where this
 * project keeps functions with no I/O — and because it is where the unit suite looks.
 */

/**
 * Drop a leading `# Title` from a statement when it only repeats the title the page already
 * shows.
 *
 * Statements are authored as standalone markdown documents, so opening with the problem's name
 * is the right thing for the file and the wrong thing once it is rendered under a page heading
 * that says the same words. The result was the title twice, six lines apart, plus a second `h1`
 * on the page — which axe does not flag but which makes the document outline claim there are two
 * documents here.
 *
 * Matched against the title rather than stripped unconditionally: a statement that opens with a
 * genuinely different heading is saying something, and it keeps it.
 */
export function statementWithoutRepeatedTitle(statementMd: string, title: string): string {
  const trimmed = statementMd.replace(/^\s+/, "");
  const [firstLine, ...rest] = trimmed.split("\n");
  if (firstLine === undefined || !firstLine.startsWith("# ")) return statementMd;
  if (firstLine.slice(2).trim().toLowerCase() !== title.trim().toLowerCase()) return statementMd;
  return rest.join("\n").replace(/^\s+/, "");
}

const FENCE_LINE = /^\s*(```|~~~)/;
const HEADING_LINE = /^(#{1,6})\s+(.*)$/;

/** "Constraints", "**Constraints:**", "Constraints ##". Case-insensitive, nothing else. */
function isConstraintsHeading(text: string): boolean {
  const words = text
    .replace(/\s+#+\s*$/, "")
    .replace(/[*_`]/g, "")
    .replace(/:\s*$/, "")
    .trim()
    .toLowerCase();
  return words === "constraints";
}

/**
 * Drop every `Constraints` section from a statement shown to a student: the heading and
 * everything under it, up to the next heading of the same or higher rank, or the end.
 *
 * The organizers asked for the student page to be as plain as possible, and the constraints were
 * the section students read least and asked about most. The content files and the organizer's
 * editor keep them; this only changes what a student is shown.
 *
 * Fence-aware, because a `#` line inside a code block is sample data and not a heading: a
 * statement whose example prints `######` must not have its section boundary found there.
 */
export function statementWithoutConstraints(statementMd: string): string {
  const lines = statementMd.split("\n");
  const kept: string[] = [];
  let inFence = false;
  let droppingAtLevel: number | null = null;
  let dropped = false;

  for (const line of lines) {
    const heading = inFence ? null : HEADING_LINE.exec(line);
    if (heading !== null) {
      const level = (heading[1] ?? "").length;
      if (droppingAtLevel !== null && level <= droppingAtLevel) {
        droppingAtLevel = null;
        // One blank line between what came before the cut and the heading after it.
        if (kept.length > 0) kept.push("");
      }
      if (droppingAtLevel === null && isConstraintsHeading(heading[2] ?? "")) {
        droppingAtLevel = level;
        dropped = true;
        // The blank lines that separated the previous section from the dropped one.
        while (kept.length > 0 && (kept[kept.length - 1] ?? "").trim() === "") kept.pop();
      }
    }
    if (FENCE_LINE.test(line)) inFence = !inFence;
    if (droppingAtLevel === null) kept.push(line);
  }

  if (!dropped) return statementMd;
  const body = kept.join("\n");
  // Only the cut points were tidied; blank lines inside the sections that remain, including
  // inside sample data, are left exactly as the author wrote them.
  return statementMd.endsWith("\n") && !body.endsWith("\n") ? `${body}\n` : body;
}
