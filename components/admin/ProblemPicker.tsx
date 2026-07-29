"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button, Rail } from "@/components/ui";
import { HistoryFlag, historyMeaning, isRepeatMistake } from "@/components/admin/HistoryFlag";
import { AlertPlate } from "@/components/admin/Panel";
import { ProblemStatePill } from "@/components/admin/StatusPill";
import { draftBlockers, type AdminProblemSummary } from "@/components/admin/contract";

/**
 * The problem picker.
 *
 * Its job is not "list the problem bank" — it is to stop two specific mistakes:
 *
 *  1. **Re-picking a problem nobody has ever scored on.** Nine imported titles were used in
 *     a past contest and produced zero points from anybody (PRD §8). Those rows are marked
 *     with an inverted plate and can be filtered to on their own, because a quiet grey tag
 *     in a list of forty is not a warning.
 *  2. **Adding a DRAFT problem to a live contest.** The API rejects that regardless
 *     (PRD §8), so the UI's job is to make the refusal predictable: the control is disabled
 *     *and* says exactly what is missing, rather than failing after the click.
 */

type Filter = "all" | "usable" | "zero-points" | "unused" | "draft";

const FILTERS: readonly { readonly id: Filter; readonly label: string }[] = [
  { id: "all", label: "All" },
  { id: "usable", label: "Ready for a live contest" },
  { id: "zero-points", label: "Nobody ever scored" },
  { id: "unused", label: "Never used" },
  { id: "draft", label: "Still DRAFT" },
];

function matchesFilter(problem: AdminProblemSummary, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "usable":
      return draftBlockers(problem).length === 0;
    case "zero-points":
      return problem.pastStatus === "used-but-zero-points";
    case "unused":
      return problem.pastStatus === "candidate-unused";
    case "draft":
      return problem.state === "DRAFT";
  }
}

export interface ProblemPickerProps {
  problems: readonly AdminProblemSummary[];
  /** Slots already in the contest, so the picker can show what has been taken. */
  selectedIds?: readonly string[];
  onAdd?: (problem: AdminProblemSummary) => void;
}

export function ProblemPicker({ problems, selectedIds = [], onAdd }: ProblemPickerProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return problems.filter(
      (problem) =>
        matchesFilter(problem, filter) &&
        (needle === "" || problem.title.toLowerCase().includes(needle)),
    );
  }, [problems, filter, query]);

  const zeroPointCount = problems.filter((p) => isRepeatMistake(p.pastStatus)).length;

  return (
    <div className="flex flex-col gap-5">
      {zeroPointCount > 0 && (
        <AlertPlate
          tone="notice"
          live={false}
          title={`${zeroPointCount} problems in this bank scored zero points last time`}
          actions={
            <Button type="button" variant="primary" onClick={() => setFilter("zero-points")}>
              Show only those
            </Button>
          }
        >
          They were used in a past contest and nobody got a single point. That is the
          spreadsheet&rsquo;s most useful memory. Pick one again on purpose, not by accident.
        </AlertPlate>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1" style={{ fontSize: "var(--text-sm)" }}>
          <span className="font-semibold">Search titles</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-64 rounded border border-ink/25 bg-paper px-3 py-2"
            placeholder="e.g. magic square"
          />
        </label>

        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Filter the problem bank</legend>
          {FILTERS.map((option) => {
            const active = option.id === filter;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option.id)}
                className={`rounded border px-3 py-1.5 font-semibold ${
                  active ? "border-panther bg-panther text-paper" : "border-ink/20"
                }`}
                style={{ fontSize: "var(--text-xs)" }}
              >
                {option.label}
              </button>
            );
          })}
        </fieldset>
      </div>

      <p className="numeric opacity-70" role="status" style={{ fontSize: "var(--text-xs)" }}>
        {visible.length} of {problems.length} problems
      </p>

      <ul className="flex flex-col gap-3">
        {visible.map((problem) => (
          <ProblemRow
            key={problem.problemId}
            problem={problem}
            picked={selected.has(problem.problemId)}
            onAdd={onAdd}
          />
        ))}
      </ul>

      {visible.length === 0 && (
        <p className="opacity-70" style={{ fontSize: "var(--text-sm)" }}>
          No problems match. Clear the search or pick a different filter.
        </p>
      )}
    </div>
  );
}

function ProblemRow({
  problem,
  picked,
  onAdd,
}: {
  problem: AdminProblemSummary;
  picked: boolean;
  onAdd?: (problem: AdminProblemSummary) => void;
}) {
  const blockers = draftBlockers(problem);
  const blocked = blockers.length > 0;
  const alarming = isRepeatMistake(problem.pastStatus);

  return (
    <li className="flex rounded border border-ink/12">
      <Rail state="brand" className="rounded-l" />
      <div className="min-w-0 flex-1 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-md)" }}>
            <Link href={`/admin/problems/${problem.slug}`} className="underline-offset-4 hover:underline">
              {problem.title}
            </Link>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <HistoryFlag status={problem.pastStatus} />
            <ProblemStatePill state={problem.state} />
          </div>
        </div>

        <p className="numeric mt-1 opacity-70" style={{ fontSize: "var(--text-xs)" }}>
          {problem.difficulty ?? "?"} · {problem.division ?? "either division"} ·{" "}
          {problem.testCaseCount} tests ({problem.sampleCaseCount} sample) ·{" "}
          {problem.referencePasses === true
            ? "reference passes"
            : problem.referencePasses === false
              ? "reference FAILS"
              : "reference never run"}
        </p>

        {alarming && (
          <p className="mt-2 max-w-[70ch] font-semibold text-panther" style={{ fontSize: "var(--text-xs)" }}>
            {historyMeaning(problem.pastStatus)}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant={picked ? "ghost" : "secondary"}
            disabled={blocked || picked}
            onClick={() => onAdd?.(problem)}
          >
            {picked ? "Already in this contest" : "Add to contest"}
          </Button>

          {blocked && (
            <span className="max-w-[60ch] text-panther" style={{ fontSize: "var(--text-xs)" }}>
              Cannot be added to a live contest: {blockers.join("; ")}. The API enforces this
              too, so it is not a UI-only guard.
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
