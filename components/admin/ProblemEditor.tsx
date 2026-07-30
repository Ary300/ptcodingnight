"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { MarkdownPreview } from "@/components/admin/MarkdownPreview";
import { AlertPlate, Panel } from "@/components/admin/Panel";
import { ProblemStatePill } from "@/components/admin/StatusPill";
import { ReferenceRunner } from "@/components/admin/ReferenceRunner";
import { TestCaseEditor } from "@/components/admin/TestCaseEditor";
import { HistoryFlag } from "@/components/admin/HistoryFlag";
import {
  referenceRunFailures,
  type AdminProblemSummary,
  type ReferenceRunReport,
  type TestCaseDraft,
} from "@/components/admin/contract";
import { testCaseWarnings } from "@/components/admin/testcases";

/**
 * Problem authoring (PRD §9.2, §8).
 *
 * The DRAFT gate is the spine of this screen. A problem leaves DRAFT only when it has an
 * original statement, its own test data, and a reference solution that passes that data —
 * and the screen states which of those are missing at all times rather than only at the
 * moment somebody presses the button.
 *
 * The statement box carries the IP rule where it will actually be read: next to the cursor,
 * not in a policy document. Titles were imported from the past-contest spreadsheet;
 * statements, samples and test data are written here from scratch.
 */

export interface ProblemEditorProps {
  problem: AdminProblemSummary;
  initialStatement: string;
  initialCases: readonly TestCaseDraft[];
  initialReferenceSolution: string;
  runReference: (cases: readonly TestCaseDraft[]) => Promise<ReferenceRunReport>;
}

export function ProblemEditor({
  problem,
  initialStatement,
  initialCases,
  initialReferenceSolution,
  runReference,
}: ProblemEditorProps) {
  const [statement, setStatement] = useState(initialStatement);
  const [cases, setCases] = useState<readonly TestCaseDraft[]>(initialCases);
  const [reference, setReference] = useState(initialReferenceSolution);
  const [report, setReport] = useState<ReferenceRunReport | null>(null);

  // Any edit to the data invalidates a previous clean run: the reference passed the OLD
  // cases. Latching this to null is what stops "it went green earlier" from shipping.
  const applyCases = (next: readonly TestCaseDraft[]): void => {
    setCases(next);
    setReport(null);
  };

  const referenceClean = report !== null && report.compileError === null && referenceRunFailures(report).length === 0;
  const statementWritten = statement.trim().length >= 40;

  const blockers: readonly string[] = [
    statementWritten ? null : "Write an original statement (at least a paragraph).",
    cases.length > 0 ? null : "Add test cases.",
    ...testCaseWarnings(cases).filter((w) => w !== "No test cases yet."),
    referenceClean ? null : "Run the reference solution and get a clean pass on the current cases.",
  ].filter((value): value is string => value !== null);

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title={problem.title}
        aside={
          <span className="flex flex-wrap items-center gap-2">
            <HistoryFlag status={problem.pastStatus} />
            <ProblemStatePill state={problem.state} />
          </span>
        }
        description="Imported from the past-contest index as a title and a history flag only. Everything below is written here."
      >
        <dl className="numeric grid gap-x-8 gap-y-1 sm:grid-cols-3" style={{ fontSize: "var(--text-xs)" }}>
          <div>
            <dt className="opacity-70">Slug</dt>
            <dd>{problem.slug}</dd>
          </div>
          <div>
            <dt className="opacity-70">Difficulty</dt>
            <dd>{problem.difficulty ?? "not set"}</dd>
          </div>
          <div>
            <dt className="opacity-70">Division</dt>
            <dd>{problem.division ?? "either"}</dd>
          </div>
        </dl>
      </Panel>

      <Panel
        title="Statement"
        description="Markdown, with a live preview of exactly what a competitor sees."
      >
        <p className="mb-3 max-w-[70ch] font-semibold text-panther" style={{ fontSize: "var(--text-xs)" }}>
          Write this in your own words, with your own flavour text and your own variable
          names. Do not paste a HackerRank statement, editorial, or test data (PRD §8).
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
              Markdown source
            </span>
            <textarea
              value={statement}
              rows={22}
              spellCheck
              onChange={(e) => setStatement(e.target.value)}
              className="numeric w-full rounded border border-ink/25 bg-paper p-3"
              style={{ fontSize: "var(--text-xs)" }}
            />
          </label>

          <div className="flex flex-col gap-1">
            <h3 className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
              Preview
            </h3>
            <div className="min-h-40 overflow-auto rounded border border-ink/15 p-4">
              <MarkdownPreview source={statement} />
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Test cases" description="Bulk paste or upload paired files, then mark samples and assign points.">
        <TestCaseEditor cases={cases} onChange={applyCases} />
      </Panel>

      <Panel
        title="Reference solution"
        description="Run it against every case before this problem goes anywhere near a contest."
      >
        <label className="mb-4 flex flex-col gap-1">
          <span className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
            Reference source
          </span>
          <textarea
            value={reference}
            rows={12}
            spellCheck={false}
            onChange={(e) => {
              setReference(e.target.value);
              setReport(null);
            }}
            className="numeric w-full rounded border border-ink/25 bg-paper p-3"
            style={{ fontSize: "var(--text-xs)" }}
          />
        </label>

        <ReferenceRunner cases={cases} language="PYTHON_312" run={runReference} onResult={setReport} />
      </Panel>

      <Panel title="Leaving DRAFT" description="The API enforces the same rule. This is here so the refusal is never a surprise.">
        {blockers.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button">Mark READY</Button>
            <span style={{ fontSize: "var(--text-sm)" }}>
              Original statement, own test data, and a clean reference run. This problem may
              be used in a live contest.
            </span>
          </div>
        ) : (
          <AlertPlate tone="alarm" title="This problem stays in DRAFT" live={false}>
            <ul className="list-disc pl-5">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
            <p className="mt-3">
              A DRAFT problem cannot be added to a live contest. That is enforced by the API,
              not only by this screen.
            </p>
          </AlertPlate>
        )}
      </Panel>
    </div>
  );
}
