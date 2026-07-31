/**
 * Projector leaderboard constants.
 *
 * Everything tunable about the signature surface lives here so the numbers are reviewable
 * in one place rather than scattered through JSX. Spec: docs/DESIGN.md §5, §6.
 */

/**
 * Where the board reads standings from.
 *
 * The path itself is NOT declared here. It comes from `API_ROUTES.publicStandings` in
 * lib/schemas/api.ts, which is the single source both halves import — a second declaration in
 * a component is exactly how the frontend and the API ended up on different URLs while both
 * typechecked. `tests/e2e/wiring.api.spec.ts` fails if this file grows an `/api/...` literal
 * again.
 *
 * The board still validates whatever comes back with `StandingsResponseSchema` and falls back
 * to `PROJECTOR_SAMPLE_STANDINGS`, so a missing or malformed response never blanks the wall.
 */

/**
 * SSE is the realtime path (PRD §10) but polling is the documented fallback, and the
 * projector is the one screen that must never be blank because a stream dropped. Five
 * seconds is well inside "auto-refreshing" for a board read from ten metres away.
 */
export const POLL_INTERVAL_MS = 5_000;

/**
 * Rows shown per division. The projector does not scroll, so this is a hard cap, and it is
 * set by what fits at `--text-proj-lg` on a 1080-tall canvas *in the champion state* — where
 * the winner's row has grown to `--text-proj-2xl` and pushed everything below it down. Eight
 * is what clears the crest watermark in the bottom-left corner; the footnote carries the
 * total so the cap is never silent.
 */
export const VISIBLE_ROWS = 8;

/**
 * Rows drawn on the TEAM board, which is the default projector.
 *
 * **Measured, not chosen.** A team row is two lines — the name at `--text-proj-md` over the
 * arithmetic at `--text-proj-sm`, which is the floor — so it stands about 93px tall at
 * `--proj-scale: 1`, and the stage has roughly 750px under its header once the title, the plate
 * band and the footnote have taken theirs. Seven fit. Eight do not, and the eighth does not
 * announce itself: the board simply clips it against a footnote still claiming to show eight.
 *
 * One number serves both projector resolutions because the degrade is a uniform scale — 1280×720
 * is exactly two-thirds of 1920×1080 in both axes, so a row that fits on one fits on the other.
 *
 * It caps what is DRAWN, never what is ranked. The footnote always states the true total, so a
 * team below the cut is never silently absent.
 */
export const TEAM_VISIBLE_ROWS = 7;

/** Auto-advance through divisions while the board is live and unattended. */
export const DIVISION_ROTATE_MS = 20_000;

/** Countdown turns `--gold` inside this window. */
export const COUNTDOWN_URGENT_MS = 5 * 60_000;

/**
 * The Unfreeze (docs/DESIGN.md §6). Each field is a step in the sequence, in order.
 *
 * Under `prefers-reduced-motion` every step still runs — `REDUCED_MOTION_REVEAL` simply
 * collapses each duration to zero. No phase is skipped, so no information is lost: the
 * greyscale still lifts, the deltas still arrive at their final value, the crest still
 * fills. Only the theatre is removed.
 */
export interface RevealTimings {
  /** Gold plate lifting away, before any row moves. */
  plateLiftMs: number;
  /** Travel time for a single row from frozen position to final position. */
  rowTravelMs: number;
  /** Cascade down the board — DESIGN.md §6 step 2. */
  rowStaggerMs: number;
  /** Delta glyph counting up from `−`. */
  deltaCountMs: number;
  /** Beat between the board settling and the champion reveal. */
  championDelayMs: number;
}

export const FULL_MOTION_REVEAL: RevealTimings = {
  plateLiftMs: 700,
  rowTravelMs: 900,
  rowStaggerMs: 40,
  deltaCountMs: 600,
  championDelayMs: 400,
};

export const REDUCED_MOTION_REVEAL: RevealTimings = {
  plateLiftMs: 0,
  rowTravelMs: 0,
  rowStaggerMs: 0,
  deltaCountMs: 0,
  championDelayMs: 0,
};
