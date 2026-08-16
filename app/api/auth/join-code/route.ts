import type { NextResponse } from "next/server";
import { z } from "zod";

import { seatForJoinCode } from "@/lib/contest/join-code";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import { joinCodeBackoff } from "@/lib/contest/rate-limit";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/contest/session";
import { issueSession } from "@/lib/contest/session-store";

/**
 * `POST /api/auth/join-code` — sign in by typing the code on your slip of paper.
 *
 * The night's primary door. Organizers build the roster beforehand and each seat carries a code;
 * typing it signs the student in AS that participant, already on their team. No account, no
 * email, no password, which is the whole point: forty students making accounts at the door is
 * forty ways for the first ten minutes to go wrong.
 *
 * Throttled per client, because a code is short and this endpoint is the one place that turns a
 * guess into a session. The limiter is the same shape the password route uses; it is not the
 * security boundary (see `lib/contest/join-code.ts` for what actually is), it just makes
 * enumeration pointless rather than merely unrewarding.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  code: z.string().trim().min(1, "Type the code from your slip.").max(32),
});

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const input = await readJson(request, RequestSchema);

    await joinCodeBackoff.throttle();
    let seat;
    try {
      seat = await seatForJoinCode(input.code);
      joinCodeBackoff.recordSuccess();
    } catch (error: unknown) {
      joinCodeBackoff.recordFailure();
      throw error;
    }

    const session = await issueSession(
      {
        role: "COMPETITOR",
        method: "JOIN_CODE",
        displayName: seat.displayName,
        participantId: seat.participantId,
        contestId: seat.contestId,
      },
      now,
    );

    const response = jsonOk(
      {
        displayName: seat.displayName,
        teamName: seat.teamName,
      },
      NO_STORE,
    );
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions());
    return response;
  });
}
