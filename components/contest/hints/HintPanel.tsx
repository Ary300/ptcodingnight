"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui";

import { contestApi, errorMessageOf } from "../data/backend";
import type { HintBalance } from "../data/contract";
import { useResource } from "../data/useResource";

/**
 * Hints — balance, warmups solved, and what the next one costs, **shown before the student
 * commits** (PRD §9.1).
 *
 * That ordering is the whole feature. A student deciding whether to spend a hint is doing a
 * cost-benefit calculation, and a UI that reveals the price after the click has made the
 * decision for them. So the cost is on the button itself, and confirming is a second,
 * separate action that restates the price and the resulting balance.
 *
 * Colour is never the signal here either: "2 hints left" is a number, not a green dot.
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

  const [confirming, setConfirming] = useState(false);
  const [taking, setTaking] = useState(false);
  const [taken, setTaken] = useState<HintBalance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = taken ?? balance.data;

  const take = useCallback(async () => {
    setTaking(true);
    setError(null);
    try {
      const next = await contestApi.takeHint(contestProblemId);
      setTaken(next);
      setConfirming(false);
    } catch (caught: unknown) {
      setError(errorMessageOf(caught));
    } finally {
      setTaking(false);
    }
  }, [contestProblemId]);

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
        <p className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
          {balance.error ?? "Hint balance unavailable."}
        </p>
      </section>
    );
  }

  const canAfford = current.hintsAvailable > 0;

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

      {!canAfford && (
        <p className="mt-3 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
          You have no hints left. Solve another warmup to earn one.
        </p>
      )}

      {canAfford && !confirming && (
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          style={{ fontSize: "var(--text-xs)" }}
          onClick={() => setConfirming(true)}
        >
          Take a hint — costs {current.nextHintCost} pts
        </Button>
      )}

      {canAfford && confirming && (
        // Deliberately a second, explicit step. The price is restated, not remembered.
        <div className="mt-3 rounded border border-panther/40 p-3">
          <p style={{ fontSize: "var(--text-xs)" }}>
            Take a hint on <strong>{problemTitle}</strong>? It costs{" "}
            <span className="numeric font-semibold">{current.nextHintCost}</span> points, and
            you will have{" "}
            <span className="numeric font-semibold">{current.hintsAvailable - 1}</span> hint
            {current.hintsAvailable - 1 === 1 ? "" : "s"} left. This cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              onClick={() => void take()}
              disabled={taking}
              style={{ fontSize: "var(--text-xs)" }}
            >
              {taking ? "Taking…" : `Yes, spend ${current.nextHintCost} pts`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={taking}
              style={{ fontSize: "var(--text-xs)" }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {taken !== null && (
        <p className="mt-3 text-ink/75" aria-live="polite" style={{ fontSize: "var(--text-xs)" }}>
          Hint taken. {/* The contract has no response field carrying the hint text — see the
                          report. Until it does, there is nothing honest to render here. */}
          Ask an organizer for the hint text; the platform cannot show it yet.
        </p>
      )}

      {error !== null && (
        <p role="alert" className="mt-3 text-panther" style={{ fontSize: "var(--text-xs)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
