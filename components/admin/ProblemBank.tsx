"use client";

import { useState } from "react";

import { Panel } from "@/components/admin/Panel";
import { ProblemPicker } from "@/components/admin/ProblemPicker";
import type { AdminProblemSummary } from "@/components/admin/contract";

/**
 * Client wrapper holding the "which problems are in this contest" selection, so the picker
 * itself stays a presentation component and the page stays a server component.
 */

export interface ProblemBankProps {
  problems: readonly AdminProblemSummary[];
}

export function ProblemBank({ problems }: ProblemBankProps) {
  const [picked, setPicked] = useState<readonly AdminProblemSummary[]>([]);

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="In this contest"
        aside={
          <span className="numeric opacity-70" style={{ fontSize: "var(--text-xs)" }}>
            {picked.length} selected
          </span>
        }
        description="Slot labels and base points are set on the contest screen once the line-up is settled."
      >
        {picked.length === 0 ? (
          <p className="opacity-70" style={{ fontSize: "var(--text-sm)" }}>
            Nothing picked yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" style={{ fontSize: "var(--text-sm)" }}>
            {picked.map((problem) => (
              <li key={problem.problemId} className="flex items-center justify-between gap-3 border-b border-ink/10 pb-2">
                <span>{problem.title}</span>
                <button
                  type="button"
                  className="text-panther underline underline-offset-2"
                  style={{ fontSize: "var(--text-xs)" }}
                  onClick={() => setPicked(picked.filter((p) => p.problemId !== problem.problemId))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Problem bank" description="125 problems imported from the past-contest index, with their history.">
        <ProblemPicker
          problems={problems}
          selectedIds={picked.map((p) => p.problemId)}
          onAdd={(problem) => setPicked((current) => [...current, problem])}
        />
      </Panel>
    </div>
  );
}
