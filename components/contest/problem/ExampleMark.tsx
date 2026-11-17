import type { Verdict } from "@/lib/schemas/judge";

import { VERDICT_DISPLAY } from "../verdict/verdict-display";

/**
 * The pass or fail mark on an example, drawn on the statement's paper.
 *
 * Not the verdict panel's `CaseMark`: rise and fall are dark-surface colours and fail AA on
 * `--paper` (DESIGN.md §2). Here a pass is an ink ring with an ink check, a failure is a
 * panther disc with a paper cross (5.08:1 both ways), and a compile or internal error is an ink
 * ring with a dash, because an IE must never read as "your code failed". The word beside the
 * mark always says the same thing, so colour is never the only signal.
 */
export function ExampleMark({ verdict }: { verdict: Verdict }) {
  const tone = VERDICT_DISPLAY[verdict].tone;
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
      {tone === "fail" ? (
        <>
          <circle cx="8" cy="8" r="8" fill="var(--color-panther)" />
          <path
            d="M5.5 5.5l5 5m0-5l-5 5"
            fill="none"
            stroke="var(--color-paper)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="7" fill="none" stroke="var(--color-ink)" strokeWidth="1.5" />
          {tone === "pass" ? (
            <path
              d="M4.5 8.5 7 11l4.5-5.5"
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path d="M5 8h6" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
          )}
        </>
      )}
    </svg>
  );
}
