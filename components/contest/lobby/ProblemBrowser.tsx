"use client";

import { useCallback, useMemo, useState } from "react";

import type { ProblemSummary } from "@/lib/schemas/api";

import { FilterRail, type FilterGroup } from "../FilterRail";
import { ProblemList } from "./ProblemList";

/**
 * The problem list with HackerRank's filter rail beside it: STATUS and DIFFICULTY, as checkbox
 * groups.
 *
 * ## Why filtering is worth having in a ninety-minute contest
 *
 * Fourteen problems is enough that "which of these have I not done" stops being answerable by
 * eye, and that is the question a student asks every few minutes. The filter is not organisation
 * for its own sake — it is the fastest route to the next problem worth attempting.
 *
 * ## Why the counts are in the rail
 *
 * An empty list is ambiguous: it can mean "you have solved everything" or "your filter excludes
 * everything". `Showing 0 of 12` distinguishes them without the student having to work it out,
 * and it is the one line that stops a filter looking like a broken page.
 */

const GROUPS: readonly FilterGroup[] = [
  {
    id: "status",
    label: "Status",
    options: [
      { value: "solved", label: "Solved" },
      { value: "unsolved", label: "Unsolved" },
    ],
  },
  {
    id: "difficulty",
    label: "Difficulty",
    options: [
      { value: "E", label: "Easy" },
      { value: "M", label: "Medium" },
      { value: "H", label: "Hard" },
    ],
  },
];

export interface ProblemBrowserProps {
  problems: readonly ProblemSummary[];
}

export function ProblemBrowser({ problems }: ProblemBrowserProps) {
  const [selected, setSelected] = useState<Readonly<Record<string, readonly string[]>>>({});

  const onChange = useCallback((groupId: string, value: string, checked: boolean) => {
    setSelected((current) => {
      // Immutable update: a new object and a new array, never a push into the existing one.
      const existing = current[groupId] ?? [];
      const next = checked
        ? [...existing, value]
        : existing.filter((entry) => entry !== value);
      return { ...current, [groupId]: next };
    });
  }, []);

  const visible = useMemo(() => {
    const status = selected.status ?? [];
    const difficulty = selected.difficulty ?? [];

    return problems.filter((problem) => {
      // An empty group filters nothing. Ticking BOTH boxes in a group is the same as ticking
      // neither, which is what a reader expects from "solved OR unsolved" and costs nothing to
      // get right.
      if (status.length > 0) {
        const label = problem.solved ? "solved" : "unsolved";
        if (!status.includes(label)) return false;
      }
      if (difficulty.length > 0) {
        // An unrated problem has no difficulty, so it cannot satisfy a difficulty filter. It is
        // excluded rather than shown, because a filter that quietly keeps non-matching rows is
        // worse than one that returns nothing.
        if (problem.difficulty === null || !difficulty.includes(problem.difficulty)) return false;
      }
      return true;
    });
  }, [problems, selected]);

  const filtering = (selected.status ?? []).length > 0 || (selected.difficulty ?? []).length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_11rem]">
      <div className="min-w-0">
        {visible.length === 0 && filtering ? (
          <p role="status" className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            No problems match those filters. Untick one to widen the list.
          </p>
        ) : (
          <ProblemList problems={visible} />
        )}
      </div>

      {/*
        The rail is second in the DOM and second in tab order, on purpose. The problems are what
        the student came for; a filter they have to tab past on every visit is the kind of thing
        that makes keyboard navigation technically complete and practically annoying.
      */}
      <FilterRail
        groups={GROUPS}
        selected={selected}
        onChange={onChange}
        footer={
          filtering
            ? `Showing ${String(visible.length)} of ${String(problems.length)}`
            : `${String(problems.length)} problems`
        }
      />
    </div>
  );
}
