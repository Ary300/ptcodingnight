"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "../../ui/Button";
import { contestApi, errorMessageOf, isStubBackend } from "../data/backend";
import type { HintBalance } from "../data/contract";
import { useResource } from "../data/useResource";

/**
 * Hints, in HackerRank's locked-content shape: a bordered card whose body is visibly blurred-out
 * placeholder, a price in the card header, and ONE action carrying that price on its face.
 * (Reference: `hr-challenge-live.png` — the challenge page washed out behind a single card with
 * an info strip and one primary action. Same grammar here, per problem instead of per page.)
 *
 * ## The three rules this panel exists to enforce
 *
 * 1. **The cost is the server's quote, never a local computation.** `HintBalance.nextHintCost`
 *    is the only number this file ever shows or charges. Scoring lives in `lib/scoring/`; the
 *    component would not know how to price a hint even if it wanted to.
 * 2. **The exact cost is stated BEFORE the student commits, twice.** Once on the unlock button
 *    itself, and again in a confirm step that captures the quote at offer time (`flow.quotedCost`)
 *    so the number the student confirms is byte-for-byte the number they clicked.
 * 3. **A taken hint stays on screen.** A hint you paid for and cannot re-read is a bug, so every
 *    grant renders as its own card above the locked one for as long as this screen lives.
 *    (Re-reading across a reload needs a server list of past grants, which does not exist yet —
 *    see the note on `TakenHint`.)
 *
 * ## Why the unlock is offered on the stub backend only
 *
 * No field in the schema holds hint TEXT (docs/TODO.md T1): `takeHint` returns a fresh
 * `HintBalance` and nothing else, so a purchase on the real backend would take a student's
 * points and hand back nothing. A UI must not offer what it cannot deliver. Independently, the
 * HTTP backend rejects `getHintBalance` with NOT_IMPLEMENTED, so on a live contest this panel
 * shows the plain "not available" card regardless. The full flow below is therefore reachable
 * exactly where it charges nobody real points: the design-preview stub. When T1 lands hint text
 * on the purchase response, widen `offerUnlock` to the live backend and render the returned text
 * in `TakenHintCard`; everything else is already wired.
 */

export interface HintPanelProps {
  contestProblemId: string;
  problemTitle: string;
}

/**
 * One grant, kept for the life of the screen. `ordinal` comes from the server's post-purchase
 * `hintsSpent` and `cost` echoes the quote that was confirmed — neither is counted or priced
 * here. There is no hint text field yet (docs/TODO.md T1); when the contract carries one it
 * belongs on this record and in `TakenHintCard`.
 */
interface TakenHint {
  readonly ordinal: number;
  readonly cost: number;
}

type Flow =
  | { readonly step: "idle" }
  | { readonly step: "confirming"; readonly quotedCost: number }
  | { readonly step: "taking"; readonly quotedCost: number }
  | { readonly step: "failed"; readonly message: string };

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

/**
 * The locked body. Decorative bars, blurred — the HackerRank wash without the risk: there is no
 * real text under the blur, so no CSS trick can reveal what has not been paid for.
 */
function LockedBody() {
  return (
    <div aria-hidden="true" className="space-y-2 p-3">
      <div className="h-2.5 w-full rounded bg-ink/10 blur-[2px]" />
      <div className="h-2.5 w-5/6 rounded bg-ink/10 blur-[2px]" />
      <div className="h-2.5 w-3/5 rounded bg-ink/10 blur-[2px]" />
    </div>
  );
}

function TakenHintCard({ hint }: { hint: TakenHint }) {
  return (
    <article className="mt-3 rounded border border-ink/15 bg-ink/[0.03]">
      <header className="flex items-baseline justify-between gap-2 border-b border-ink/10 px-3 py-2">
        <span className="font-semibold" style={{ fontSize: "var(--text-xs)" }}>
          Hint {hint.ordinal} <span className="font-medium text-ink/60">unlocked</span>
        </span>
        <span className="numeric text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          {hint.cost} points
        </span>
      </header>
      <p className="px-3 py-2 text-ink/75" style={{ fontSize: "var(--text-xs)" }}>
        The written hint appears here. This preview backend carries no hint text yet, so this
        card shows the shape only.
      </p>
    </article>
  );
}

export function HintPanel({ contestProblemId, problemTitle }: HintPanelProps) {
  const load = useCallback(
    () => contestApi.getHintBalance(contestProblemId),
    [contestProblemId],
  );
  const balance = useResource<HintBalance>(load);

  const [flow, setFlow] = useState<Flow>({ step: "idle" });
  const [taken, setTaken] = useState<readonly TakenHint[]>([]);
  /** The balance after a purchase, fresher than the loaded resource. Never mutated in place. */
  const [afterPurchase, setAfterPurchase] = useState<HintBalance | null>(null);

  /*
   * Confirming a spend is the one place focus is moved: to the CANCEL button, not the confirm.
   * The unlock button sits where the confirm block appears, so focusing the destructive action
   * would let one accidental double-Enter charge the student. Backing out must be the free key.
   */
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (flow.step === "confirming") {
      cancelRef.current?.focus();
    }
  }, [flow.step]);

  const takeNow = useCallback(
    async (quotedCost: number) => {
      setFlow({ step: "taking", quotedCost });
      try {
        const after = await contestApi.takeHint(contestProblemId);
        setAfterPurchase(after);
        setTaken((prev) => [...prev, { ordinal: after.hintsSpent, cost: quotedCost }]);
        setFlow({ step: "idle" });
      } catch (error: unknown) {
        setFlow({ step: "failed", message: errorMessageOf(error) });
      }
    },
    [contestProblemId],
  );

  const current = afterPurchase ?? balance.data;

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
          student might retry; on the live backend this is a feature that is not finished
          (docs/TODO.md T1), and saying so plainly is the only thing that does not waste their
          time.
        */}
        <p className="mt-2 text-ink/75" style={{ fontSize: "var(--text-xs)" }}>
          Hints are not available in this contest. Ask an organizer if you are stuck.
        </p>
      </section>
    );
  }

  // See the header comment: real backend cannot deliver hint text yet, and cannot reach here
  // anyway. Widen to the live backend when the purchase response carries the text (T1).
  const offerUnlock = isStubBackend && current.hintsAvailable > 0;
  const nextOrdinal = current.hintsSpent + 1;
  const confirming = flow.step === "confirming" || flow.step === "taking";

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

      {taken.map((hint) => (
        <TakenHintCard key={hint.ordinal} hint={hint} />
      ))}

      {/* The locked card: HackerRank's paywall grammar, priced in the header AND on the button. */}
      <article className="mt-3 rounded border border-ink/15">
        <header className="flex items-baseline justify-between gap-2 border-b border-ink/10 bg-ink/[0.04] px-3 py-2">
          <span className="font-semibold" style={{ fontSize: "var(--text-xs)" }}>
            Hint {nextOrdinal} <span className="font-medium text-ink/60">locked</span>
          </span>
          <span className="numeric font-semibold" style={{ fontSize: "var(--text-xs)" }}>
            {current.nextHintCost} points
          </span>
        </header>

        <LockedBody />

        <div className="border-t border-ink/10 px-3 py-3">
          <p className="text-ink/75" style={{ fontSize: "var(--text-xs)" }}>
            Unlocking this hint costs <span className="numeric font-semibold">{current.nextHintCost}</span>{" "}
            points off your score on <strong>{problemTitle}</strong>. Solving warmups earns more
            hints.
          </p>

          {flow.step === "failed" && (
            <p role="alert" className="mt-2 font-semibold text-panther" style={{ fontSize: "var(--text-xs)" }}>
              Could not take the hint: {flow.message}
            </p>
          )}

          {!offerUnlock && (
            <p className="mt-2 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
              {current.hintsAvailable === 0 && isStubBackend
                ? "You have no hints to spend. Solve another warmup to earn one."
                : "Hints cannot be taken in this contest yet. Ask an organizer if you are stuck. Your earned balance is shown above and is not lost."}
            </p>
          )}

          {offerUnlock && !confirming && (
            <div className="mt-3">
              <Button size="sm" onClick={() => setFlow({ step: "confirming", quotedCost: current.nextHintCost })}>
                Unlock hint {nextOrdinal}: {current.nextHintCost} points
              </Button>
            </div>
          )}

          {(flow.step === "confirming" || flow.step === "taking") && (
            <div
              role="group"
              aria-label="Confirm taking this hint"
              className="mt-3 rounded border-2 border-panther p-3"
            >
              <p className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
                Take hint {nextOrdinal} for{" "}
                <span className="numeric">{flow.quotedCost}</span> points?
              </p>
              <p className="mt-1 text-ink/75" style={{ fontSize: "var(--text-xs)" }}>
                Exactly <span className="numeric font-semibold">{flow.quotedCost}</span> points come
                off your score on <strong>{problemTitle}</strong> the moment you confirm, and they
                do not come back. The hint stays readable here for the rest of the contest.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={flow.step === "taking"}
                  onClick={() => void takeNow(flow.quotedCost)}
                >
                  {flow.step === "taking"
                    ? "Taking hint…"
                    : `Yes, take it: ${String(flow.quotedCost)} points`}
                </Button>
                <Button
                  ref={cancelRef}
                  size="sm"
                  variant="secondary"
                  disabled={flow.step === "taking"}
                  onClick={() => setFlow({ step: "idle" })}
                >
                  Keep my points
                </Button>
              </div>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
