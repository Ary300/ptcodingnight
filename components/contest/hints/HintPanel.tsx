"use client";

import { useCallback } from "react";

import { contestApi } from "../data/backend";
import type { HintBalance } from "../data/contract";
import { useResource } from "../data/useResource";

/**
 * Hints — balance and price, and **no way to buy one**.
 *
 * ## Why the spend control is gone rather than disabled
 *
 * The hint economy is fully specified (PRD §6.3, §9.1): two warmups earn a hint, each hint costs
 * 15% of a group problem's base points, and the price must be shown before the student commits.
 * All of that is implemented. What is not specified anywhere — not in the PRD, not in the domain
 * model, not in `prisma/schema.prisma` — is what a hint IS. `HintGrant` records that a hint was
 * taken and what it cost; **no field in the schema holds hint text**, and no screen lets an
 * organizer write one.
 *
 * So a purchase here charges a student 15% of a problem and returns nothing. This panel used to
 * offer exactly that, and then say "ask an organizer; the platform cannot show it yet" — which is
 * honest about the outcome and still takes the points. **A UI must not offer what it cannot
 * deliver**, so the button is removed until `docs/TODO.md` T1 is resolved.
 *
 * The balance figures stay when the API can supply them: "you have earned two hints" is true and
 * useful even while spending them is not possible.
 *
 * Restoring this is deliberately small — put back the confirm flow below and render the returned
 * hint text. The PRD decision has to come first.
 */

export interface HintPanelProps {
  contestProblemId: string;
  problemTitle: string;
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="numeric font-semibold" style={{ fontSize: "var(--text-md)" }}>
        {value}
      </div>
      <div className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        {label}
      </div>
    </div>
  );
}

export function HintPanel({ contestProblemId, problemTitle }: HintPanelProps) {
  const load = useCallback(
    () => contestApi.getHintBalance(contestProblemId),
    [contestProblemId],
  );
  const balance = useResource<HintBalance>(load);

  const current = balance.data;

  if (balance.status === "loading") {
    return (
      <section aria-label="Hints" className="rounded border border-ink/15 p-4">
        <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          Loading hint balance…
        </p>
      </section>
    );
  }

  if (current === null) {
    return (
      <section aria-label="Hints" className="rounded border border-ink/15 p-4">
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
          Hints
        </h2>
        {/*
          A statement, not an error. "Hint balance unavailable" reads as a transient fault a
          student might retry; this is a feature that is not finished, and saying so plainly is
          the only thing that does not waste their time.
        */}
        <p className="mt-2 text-ink/75" style={{ fontSize: "var(--text-xs)" }}>
          Hints are not available in this contest. Ask an organizer if you are stuck.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Hints" className="rounded border border-ink/15 p-4">
      <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
        Hints
      </h2>

      <div className="mt-3 grid grid-cols-3 gap-4">
        <Figure label="warmups solved" value={current.warmupsSolved} />
        <Figure label="hints earned" value={current.hintsEarned} />
        <Figure label="hints left" value={current.hintsAvailable} />
      </div>

      <p className="mt-3 text-ink/75" style={{ fontSize: "var(--text-xs)" }}>
        The next hint on <strong>{problemTitle}</strong> costs{" "}
        <span className="numeric font-semibold">{current.nextHintCost}</span> points off this
        problem&rsquo;s score. Solving warmups earns more.
      </p>

      {/*
        Where the "Take a hint" button used to be.

        Spending is not offered because there is nothing to hand back: no field in the schema
        holds hint text (docs/TODO.md T1). Charging 15% of a problem for that is not a degraded
        feature, it is taking a student's points for nothing.
      */}
      <p className="mt-3 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
        Hints cannot be taken in this contest yet — ask an organizer if you are stuck. Your earned
        balance is shown above and is not lost.
      </p>
    </section>
  );
}
