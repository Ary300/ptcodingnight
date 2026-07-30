import type { NextResponse } from "next/server";

import { JoinRequestSchema, JoinResponseSchema } from "@/lib/schemas/api";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readJson,
  readParams,
} from "@/lib/contest/http";
import { sessionSecret } from "@/lib/contest/env";
import { isWrongJoinCode, joinContest } from "@/lib/contest/join";
import {
  JOIN_CLAIM_COOKIE,
  joinClaimCookieOptions,
  mintJoinClaim,
  readJoinClaim,
} from "@/lib/contest/join-claim";
import { clientKey, joinFailureLimiter, joinLimiter } from "@/lib/contest/rate-limit";
import {
  SESSION_COOKIE,
  parseCookieHeader,
  sessionCookieOptions,
} from "@/lib/contest/session";
import { issueSession } from "@/lib/contest/session-store";

/**
 * `POST /api/contests/{id}/join` — join with a code and a display name (docs/PRD.md §9.1).
 *
 * The response also mints the session cookie the rest of the API authorizes against. Thin, as
 * route handlers here are: validate, delegate, respond.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, ContestIdParamsSchema);

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

    // Same claim handling as the flat route — this one must not be the looser of the two paths
    // to the same write, or the fix would be one URL away from being bypassed (T5).
    const claim = readJoinClaim(
      parseCookieHeader(request.headers.get("cookie"))[JOIN_CLAIM_COOKIE],
      sessionSecret(),
    );

    let joined;
    try {
      joined = await joinContest(input, id, now, claim);
    } catch (error: unknown) {
      // Same narrowing as the flat route, and for the same reason: the bucket is shared, so a
      // CONFLICT a student can hit honestly must not spend the room's wrong-code allowance.
      if (isWrongJoinCode(error)) {
        joinFailureLimiter.consumeOrThrow(
          "join-failures",
          now,
          "Too many wrong join codes. Wait a few minutes.",
        );
      }
      throw error;
    }

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
    response.cookies.set(
      JOIN_CLAIM_COOKIE,
      mintJoinClaim(joined.participantId, joined.contestId, sessionSecret()),
      joinClaimCookieOptions(),
    );
    return response;
  });
}
