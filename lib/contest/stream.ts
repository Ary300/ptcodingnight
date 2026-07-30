import { DomainError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { SSE_EVENTS, VerdictEventSchema } from "@/lib/schemas/api";
import { isPublicBoardFrozen } from "@/lib/contest/gate";
import { getStandings, loadScoringInput } from "@/lib/contest/standings";
import { getSubmissionView, reconcile } from "@/lib/contest/submissions";
import { isAdmin, type Viewer } from "@/lib/contest/viewer";

/**
 * Server-sent events for verdicts and the leaderboard.
 *
 * The constraint from docs/PRD.md §10 shapes this file: **polling is the documented fallback**,
 * so no state may exist only in the stream. Every event below is a re-send of something a plain
 * GET already returns — standings from `/standings`, verdicts from `/submissions/{id}` — and the
 * tick calls the very same functions. If SSE fails on the night, the room loses smoothness and
 * nothing else.
 *
 * A stream is also scoped to its viewer. Verdict events carry per-test detail, so they go only
 * to the participant who owns the submission; a spectator watching the projector gets standings
 * and contest state and nothing that belongs to a student.
 */

const TICK_MS = 2_000;

/** Streams are recycled so a forgotten projector tab does not hold a connection all night. */
const MAX_LIFETIME_MS = 30 * 60 * 1000;

/** Newest submissions considered per tick. Nobody has more than a handful in flight. */
const WATCHED_SUBMISSIONS = 25;

/**
 * How many streams this process will hold at once.
 *
 * The stream is UNAUTHENTICATED by design — the projector has no login, and requiring one is the
 * fastest way to have nothing on the wall when the room fills up. That makes it the cheapest
 * endpoint on the site to open a lot of: each connection ticks every 2 s for up to 30 minutes,
 * recomputes standings per tick, and retains a full serialized board for diffing. Nothing capped
 * the number of them, and the Caddyfile deliberately tells the proxy to hold this path open for
 * 24 hours, so nothing upstream would cut them either.
 *
 * 250 is far above a real contest — forty students, a projector, and a few organizers — and far
 * below what it takes to exhaust a 768 MB container. A refused stream degrades to the polling
 * fallback the client already has for a dropped connection, so the failure mode is a slower
 * board rather than no board.
 */
const MAX_CONCURRENT_STREAMS = 250;

let openStreams = 0;

/** Test seam, and a way for an operator to see the number that matters. */
export function openStreamCount(): number {
  return openStreams;
}

export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  Connection: "keep-alive",
  // Proxies that buffer would defeat the point of streaming.
  "X-Accel-Buffering": "no",
};

interface ContestStateEvent {
  readonly contestId: string;
  readonly state: string;
  readonly frozen: boolean;
  readonly endsAt: string;
  readonly serverTime: string;
}

async function contestStateEvent(
  contestId: string,
  viewer: Viewer,
  now: Date,
): Promise<ContestStateEvent> {
  const { contest } = await loadScoringInput(contestId, now);
  return {
    contestId,
    state: contest.state,
    frozen: !isAdmin(viewer) && isPublicBoardFrozen(contest, now),
    endsAt: contest.endsAt.toISOString(),
    serverTime: now.toISOString(),
  };
}

/**
 * Open the stream. The caller owns the `Response`; this owns the loop and its cleanup.
 */
export function openContestStream(
  contestId: string,
  viewer: Viewer,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  if (openStreams >= MAX_CONCURRENT_STREAMS) {
    throw new DomainError(
      "RATE_LIMITED",
      "Too many live connections right now. The board will keep updating; try again shortly.",
    );
  }

  const encoder = new TextEncoder();
  const startedMs = Date.now();

  let lastStandings = "";
  let lastState = "";
  /** submissionId -> the verdict/score we last told this client about. */
  const announced = new Map<string, string>();
  let closed = false;

  /**
   * Counted here rather than in `start`, because `start` may not run for a connection the client
   * abandons mid-handshake — and a counter that only ever increments is a slower version of the
   * leak it was added to prevent. `release` is idempotent for the same reason.
   */
  openStreams += 1;
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    openStreams -= 1;
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string): void => {
        if (closed) return;
        controller.enqueue(encoder.encode(chunk));
      };

      const finish = (): void => {
        if (closed) return;
        closed = true;
        release();
        controller.close();
      };

      signal.addEventListener("abort", finish, { once: true });

      // Prime the verdict map so a reconnect does not replay the whole night's verdicts as if
      // they had just happened. The client already has them from its initial GET.
      if (viewer.kind === "competitor") {
        for (const row of await recentSubmissions(viewer.participantId)) {
          if (row.verdict !== null) announced.set(row.id, `${row.verdict}:${row.score}`);
        }
      }

      while (!closed && !signal.aborted) {
        const now = new Date();

        try {
          const state = await contestStateEvent(contestId, viewer, now);
          const stateJson = JSON.stringify(state);
          if (stateJson !== lastState) {
            lastState = stateJson;
            send(sseFrame(SSE_EVENTS.contestState, state));
          }

          const standings = await getStandings(contestId, viewer, now);
          const standingsJson = JSON.stringify(standings);
          if (standingsJson !== lastStandings) {
            lastStandings = standingsJson;
            send(sseFrame(SSE_EVENTS.standings, standings));
          }

          if (viewer.kind === "competitor") {
            for (const frame of await verdictFrames(viewer, announced, now)) send(frame);
          }

          // Keeps intermediaries from closing an idle connection between verdicts.
          send(": ping\n\n");
        } catch (error: unknown) {
          console.error(
            JSON.stringify({
              level: "error",
              event: "sse.tick_failed",
              contestId,
              message: error instanceof Error ? error.message : String(error),
            }),
          );
          // One bad tick is not a reason to drop the room's leaderboard; the next tick retries.
        }

        if (Date.now() - startedMs > MAX_LIFETIME_MS) break;
        await sleep(TICK_MS, signal);
      }

      finish();
    },

    cancel() {
      closed = true;
      release();
    },
  });
}

async function recentSubmissions(
  participantId: string,
): Promise<{ id: string; verdict: string | null; score: number }[]> {
  return prisma.submission.findMany({
    where: { participantId },
    select: { id: true, verdict: true, score: true },
    orderBy: { submittedAt: "desc" },
    take: WATCHED_SUBMISSIONS,
  });
}

/**
 * Verdict frames for this participant only.
 *
 * Reconciling here is what makes the stream *feel* live — but the same call in the plain GET is
 * what makes it durable, so a student with SSE blocked loses nothing but latency.
 */
async function verdictFrames(
  viewer: Extract<Viewer, { kind: "competitor" }>,
  announced: Map<string, string>,
  now: Date,
): Promise<string[]> {
  const rows = await recentSubmissions(viewer.participantId);

  for (const row of rows) {
    if (row.verdict === null) await reconcile(row.id, now);
  }

  const frames: string[] = [];
  for (const row of await recentSubmissions(viewer.participantId)) {
    if (row.verdict === null) continue;

    const signature = `${row.verdict}:${row.score}`;
    if (announced.get(row.id) === signature) continue;
    announced.set(row.id, signature);

    const view = await getSubmissionView(row.id, viewer, now);
    frames.push(
      sseFrame(
        SSE_EVENTS.verdict,
        VerdictEventSchema.parse({
          submissionId: view.submissionId,
          verdict: view.verdict,
          score: view.score,
          testResults: view.testResults,
        }),
      ),
    );
  }
  return frames;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
