/**
 * Where a contest is in its own night, as the lobby needs to know it.
 *
 * ## Why this type exists at all
 *
 * Nothing the competitor client could already fetch names the contest or says when it starts.
 * `GET /api/auth/session` returns an identity, `GET /api/contests/{id}/standings` returns a board
 * and an `endsAt`, and the SSE `contest-state` frame carries a state and an `endsAt` — no name and
 * no `startsAt` anywhere. So a student waiting for the gun could not be told what they were
 * waiting for or how long, which is most of what a pre-start screen is for.
 *
 * The window is loaded on the server instead, in `app/(competitor)/contest/contest-phase.ts`, and
 * handed to the lobby as a prop. Server-side because it has to be in the first paint: a countdown
 * that arrives one request later starts at `--:--:--` and then jumps, and the screen it belongs to
 * is the screen a student stares at for twenty minutes.
 *
 * ## Why the two booleans are not computed here
 *
 * `submissionsOpen` and `statementsOpen` are ANSWERS FROM `lib/contest/gate.ts`, not a restatement
 * of its rules. The loader calls the gate's own assertions and records whether they threw. That
 * matters more than it looks: this screen's whole job is to tell a student what they may do, and a
 * screen that computes its own version of the gate's rules is a second source of truth that will
 * drift from the API and start lying. When the gate changes, this follows for free.
 */

/** Which of the three shapes the lobby draws. */
export type ContestPhaseName = "before" | "live" | "after";

export interface ContestPhase {
  readonly contestId: string;
  /** The contest's own name — "Park Tudor Coding Night". Not reachable from any competitor API. */
  readonly name: string;
  /**
   * True for the permanent practice arena — the contest sign-in falls back to when nothing real
   * is open. The lobby labels it in plain words so nobody mistakes the sample questions for the
   * night's contest, and it suppresses every "time remaining" framing: the arena's window ends
   * in 2100, and a seventy-year countdown reads as a bug.
   */
  readonly isPractice: boolean;
  readonly phase: ContestPhaseName;
  /** ISO instants. The countdown ticks against these. */
  readonly startsAt: string;
  readonly endsAt: string;
  /**
   * The server's clock at render time.
   *
   * A lab machine with a wrong clock would otherwise show a countdown that is confidently wrong by
   * however far it has drifted, and a student would trust it over the room. The client measures
   * the offset once on mount and counts in server time from then on.
   */
  readonly serverTime: string;
  /** Whether the judge will accept a submission right now, straight from the gate. */
  readonly submissionsOpen: boolean;
  /** Whether a problem statement can be opened right now, straight from the gate. */
  readonly statementsOpen: boolean;
  /** The viewer's team, when an organizer has put them on one. */
  readonly teamName: string | null;
  /** Teammates including the viewer. The team score is a mean, so the roster size is visible. */
  readonly teamSize: number | null;
  /** The assigned problem set's label. Sets are assigned, never chosen (PRD §6.2). */
  readonly setLabel: string | null;
}

/**
 * `2 hours 5 minutes`, `45 minutes`, `1 minute`.
 *
 * Used for the plain-language line beside the ticking digits, and for the screen-reader
 * announcement, which must never read out seconds — see `ContestClock`.
 */
export function humanDuration(ms: number): string {
  if (ms <= 0) return "any moment now";

  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(hours === 1 ? "1 hour" : `${String(hours)} hours`);
  if (minutes > 0) parts.push(minutes === 1 ? "1 minute" : `${String(minutes)} minutes`);
  // Under a minute, "0 minutes" is worse than useless: it reads as "it has started".
  return parts.length === 0 ? "less than a minute" : parts.join(" ");
}
