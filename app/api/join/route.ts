import type { NextResponse } from "next/server";

import { JoinRequestSchema, JoinResponseSchema } from "@/lib/schemas/api";
import { sessionSecret } from "@/lib/contest/env";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import { isWrongJoinCode, joinContest } from "@/lib/contest/join";
import {
  JOIN_CLAIM_COOKIE,
  joinClaimCookieOptions,
  mintJoinClaim,
  readJoinClaim,
} from "@/lib/contest/join-claim";
import { clientKey, joinFailureLimiter, joinLimiter } from "@/lib/contest/rate-limit";
import { SESSION_COOKIE, parseCookieHeader, sessionCookieOptions } from "@/lib/contest/session";
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

    /**
     * SUCCESSFUL joins are rate limited, and they were not.
     *
     * The old comment here said a shared bucket would refuse a room full of students, which was
     * true while `clientKey` was unused and every caller landed in one bucket. Behind Caddy with
     * `TRUSTED_PROXY_COUNT=1` it returns the real client address, so this is per-network — and
     * `JOIN_RULE` is sized for a classroom NAT rather than for a person.
     *
     * Without it a script with a valid code and a fresh cookie jar per request creates unlimited
     * participants, each carrying its own submission and run-samples budget. That is the amplifier
     * that turns one leaked join code into a saturated judge queue.
     *
     * Consumed BEFORE the write, so a refusal costs nothing. A WRONG code is penalised separately
     * below, on a bucket that only guessing touches.
     */
    joinLimiter.consumeOrThrow(
      clientKey(request),
      now,
      "Too many joins from this network just now. Wait a moment and try again.",
    );

    const input = await readJson(request, JoinRequestSchema);

    // The claim is what makes this idempotent: a browser that has already joined is handed its
    // existing participant, with the set it was already assigned, rather than a new one with a
    // freshly drawn set (docs/TODO.md T5).
    const claim = readJoinClaim(
      parseCookieHeader(request.headers.get("cookie"))[JOIN_CLAIM_COOKIE],
      sessionSecret(),
    );

    let joined;
    try {
      joined = await joinContest(input, null, now, claim);
    } catch (error: unknown) {
      // A bad code is the only thing worth throttling, and it must be the ONLY thing: the budget
      // is a single shared bucket of 20, so anything else that consumes it spends the whole
      // room's allowance. A taken display name and an already-joined browser are both ordinary
      // CONFLICTs a student can hit honestly — charging them here would let twenty rejoins lock
      // everyone out of joining at all.
      if (isWrongJoinCode(error)) {
        joinFailureLimiter.consumeOrThrow(
          "join-failures",
          now,
          "Too many wrong join codes. Wait a few minutes.",
        );
      }
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
    // Re-issued on a rejoin as well as a first join, so the claim's lifetime tracks the student
    // actually being here rather than expiring mid-contest on a long night.
    response.cookies.set(
      JOIN_CLAIM_COOKIE,
      mintJoinClaim(joined.participantId, joined.contestId, sessionSecret()),
      joinClaimCookieOptions(),
    );
    return response;
  });
}
