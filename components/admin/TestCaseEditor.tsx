"use client";

import { useId, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { AlertPlate } from "@/components/admin/Panel";
import type { TestCaseDraft } from "@/components/admin/contract";
import {
  CASE_SEPARATOR,
  IO_SEPARATOR,
  pairUploadedFiles,
  parseBulkTestCases,
  renumber,
  testCaseWarnings,
  totalPoints,
  type UploadedFile,
} from "@/components/admin/testcases";

/**
 * Test case editor: bulk paste, file upload, and per-case editing (PRD §9.2).
 *
 * Sample cases are worth zero points on purpose — a sample is a worked example, and paying
 * for it would mean the sample is part of the score. The editor enforces that rather than
 * asking the organiser to remember it.
 */

const IO_BOX = "numeric w-full rounded border border-ink/25 bg-paper p-2";

export interface TestCaseEditorProps {
  cases: readonly TestCaseDraft[];
  onChange: (next: readonly TestCaseDraft[]) => void;
}

export function TestCaseEditor({ cases, onChange }: TestCaseEditorProps) {
  const [bulk, setBulk] = useState("");
  const [problems, setProblems] = useState<readonly string[]>([]);
  const uploadId = useId();

  const replace = (next: readonly TestCaseDraft[]): void => onChange(renumber(next));

  const patch = (id: string, changes: Partial<TestCaseDraft>): void => {
    replace(cases.map((c) => (c.id === id ? { ...c, ...changes } : c)));
  };

  const appendBulk = (): void => {
    const result = parseBulkTestCases(bulk, cases.length);
    setProblems(result.problems);
    if (result.cases.length > 0) {
      replace([...cases, ...result.cases]);
      setBulk("");
    }
  };

  const onUpload = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const picked = event.target.files;
    if (picked === null || picked.length === 0) return;

    const read: UploadedFile[] = await Promise.all(
      Array.from(picked).map(async (file) => ({ name: file.name, text: await file.text() })),
    );
    const result = pairUploadedFiles(read, cases.length);
    setProblems(result.problems);
    if (result.cases.length > 0) replace([...cases, ...result.cases]);
    // Allow re-picking the same files after a fix.
    event.target.value = "";
  };

  const addBlank = (): void => {
    replace([
      ...cases,
      {
        id: `tc-blank-${Date.now()}`,
        ordinal: cases.length,
        input: "",
        expectedOutput: "",
        isSample: cases.length === 0,
        points: 0,
        group: null,
      },
    ]);
  };

  const warnings = testCaseWarnings(cases);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="numeric opacity-75" style={{ fontSize: "var(--text-xs)" }}>
          {cases.length} case{cases.length === 1 ? "" : "s"} ·{" "}
          {cases.filter((c) => c.isSample).length} sample · {totalPoints(cases)} points total
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={addBlank}>
            Add empty case
          </Button>
        </div>
      </div>

      {/* ---- bulk paste ---- */}
      <div className="flex flex-col gap-2">
        <label htmlFor={`${uploadId}-bulk`} className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
          Bulk paste
        </label>
        <p id={`${uploadId}-bulk-hint`} className="opacity-70" style={{ fontSize: "var(--text-xs)" }}>
          Input, a line containing <code className="numeric">{IO_SEPARATOR}</code>, expected
          output. Separate cases with a line containing{" "}
          <code className="numeric">{CASE_SEPARATOR}</code>. Pasted cases arrive hidden and
          worth 0 points; mark samples and set points below.
        </p>
        <textarea
          id={`${uploadId}-bulk`}
          aria-describedby={`${uploadId}-bulk-hint`}
          className={IO_BOX}
          style={{ fontSize: "var(--text-xs)" }}
          rows={6}
          value={bulk}
          spellCheck={false}
          onChange={(e) => setBulk(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={appendBulk}>
            Append pasted cases
          </Button>

          <label
            htmlFor={`${uploadId}-files`}
            className="cursor-pointer rounded border border-ink/20 px-4 py-2 font-semibold"
            style={{ fontSize: "var(--text-sm)" }}
          >
            Upload .in / .out files
          </label>
          <input
            id={`${uploadId}-files`}
            type="file"
            multiple
            className="sr-only"
            accept=".in,.input,.txt,.out,.output,.ans,.expected"
            onChange={(e) => {
              void onUpload(e);
            }}
          />
          <span className="opacity-70" style={{ fontSize: "var(--text-xs)" }}>
            Paired by filename: <code className="numeric">01.in</code> with{" "}
            <code className="numeric">01.out</code>.
          </span>
        </div>
      </div>

      {problems.length > 0 && (
        <AlertPlate tone="alarm" title="Some of that import did not land">
          <ul className="list-disc pl-5">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </AlertPlate>
      )}

      {/* ---- the cases ---- */}
      <ol className="flex flex-col gap-4">
        {cases.map((testCase, index) => (
          <li key={testCase.id} className="rounded border border-ink/15 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="numeric font-semibold" style={{ fontSize: "var(--text-sm)" }}>
                Case {index + 1}
              </h3>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2" style={{ fontSize: "var(--text-xs)" }}>
                  <input
                    type="checkbox"
                    checked={testCase.isSample}
                    onChange={(e) =>
                      patch(testCase.id, {
                        isSample: e.target.checked,
                        points: e.target.checked ? 0 : testCase.points,
                      })
                    }
                  />
                  Sample (shown to students, worth 0)
                </label>

                <label className="flex items-center gap-2" style={{ fontSize: "var(--text-xs)" }}>
                  Points
                  <input
                    type="number"
                    min={0}
                    step={1}
                    disabled={testCase.isSample}
                    value={testCase.points}
                    className="numeric w-20 rounded border border-ink/25 px-2 py-1 disabled:opacity-50"
                    onChange={(e) =>
                      patch(testCase.id, { points: Math.max(0, Math.trunc(e.target.valueAsNumber || 0)) })
                    }
                  />
                </label>

                <label className="flex items-center gap-2" style={{ fontSize: "var(--text-xs)" }}>
                  Group
                  <input
                    type="text"
                    value={testCase.group ?? ""}
                    placeholder="none"
                    className="w-28 rounded border border-ink/25 px-2 py-1"
                    onChange={(e) =>
                      patch(testCase.id, { group: e.target.value.trim() === "" ? null : e.target.value })
                    }
                  />
                </label>

                <ConfirmButton
                  label="Delete"
                  confirmLabel="Delete case"
                  onConfirm={() => replace(cases.filter((c) => c.id !== testCase.id))}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1" style={{ fontSize: "var(--text-xs)" }}>
                <span className="font-semibold">Input</span>
                <textarea
                  rows={5}
                  spellCheck={false}
                  className={IO_BOX}
                  style={{ fontSize: "var(--text-xs)" }}
                  value={testCase.input}
                  onChange={(e) => patch(testCase.id, { input: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1" style={{ fontSize: "var(--text-xs)" }}>
                <span className="font-semibold">Expected output</span>
                <textarea
                  rows={5}
                  spellCheck={false}
                  className={IO_BOX}
                  style={{ fontSize: "var(--text-xs)" }}
                  value={testCase.expectedOutput}
                  onChange={(e) => patch(testCase.id, { expectedOutput: e.target.value })}
                />
              </label>
            </div>
          </li>
        ))}
      </ol>

      {warnings.length > 0 && (
        <div className="rounded border border-panther/40 p-3">
          <h3 className="font-semibold text-panther" style={{ fontSize: "var(--text-sm)" }}>
            Not ready to leave DRAFT
          </h3>
          <ul className="mt-1 list-disc pl-5" style={{ fontSize: "var(--text-xs)" }}>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
