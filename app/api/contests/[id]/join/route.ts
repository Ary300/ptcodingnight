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
import { joinContest } from "@/lib/contest/join";
import { clientKey, joinLimiter } from "@/lib/contest/rate-limit";
import {
  SESSION_COOKIE,
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

    joinLimiter.consumeOrThrow(
      clientKey(request),
      now,
      "Too many join attempts. Wait a few minutes.",
    );

    const input = await readJson(request, JoinRequestSchema);
    const joined = await joinContest(input, id, now);

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
