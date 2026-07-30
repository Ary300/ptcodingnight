import type { NextResponse } from "next/server";

import { JoinRequestSchema, JoinResponseSchema } from "@/lib/schemas/api";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import { joinContest } from "@/lib/contest/join";
import { joinFailureLimiter } from "@/lib/contest/rate-limit";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/contest/session";
import { issueSession } from "@/lib/contest/session-store";

/**
 * `POST /api/join` — join with a code and a display name (docs/PRD.md §9.1).
 *
 * Flat rather than contest-scoped, because a student arrives holding a join code off the
 * board at the front of the room and nothing else. `Contest.joinCode` is `@unique` exactly so
 * the code can be the lookup key; requiring a contest id here would mean needing the result
 * of joining in order to join.
 *
 * The contest-scoped variant is kept and is strictly narrower — it additionally asserts the
 * code belongs to the contest in the URL — so this is not a looser second path to the same
 * write, just the one a competitor can actually reach.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();

    // NOT rate limited on the way in. Forty students joining in the two minutes before a round is
    // the normal case, and a shared bucket would refuse most of them — `clientKey` no longer trusts
    // a spoofable header, so there is no per-student bucket to use.
    //
    // Only a WRONG CODE is penalised, below. That is the behaviour worth limiting: guessing.

    const input = await readJson(request, JoinRequestSchema);
    let joined;
    try {
      joined = await joinContest(input, null, now);
    } catch (error: unknown) {
      // A bad code is the only thing worth throttling. Consuming AFTER the failure means a room
      // full of legitimate joins never touches this budget.
      joinFailureLimiter.consumeOrThrow(
        "join-failures",
        now,
        "Too many wrong join codes. Wait a few minutes.",
      );
      throw error;
    }

    // JOIN_CODE: the primary competitor path, and the one that needs no internet.
    const session = await issueSession(
      {
        role: "COMPETITOR",
        method: "JOIN_CODE",
        participantId: joined.participantId,
        contestId: joined.contestId,
        displayName: joined.displayName,
      },
      now,
    );

    const response = jsonOk(JoinResponseSchema.parse(joined), NO_STORE);
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions());
    return response;
  });
}
