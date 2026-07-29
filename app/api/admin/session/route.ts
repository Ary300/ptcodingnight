import type { NextResponse } from "next/server";

import { AdminLoginSchema, authenticateAdmin } from "@/lib/contest/admin";
import { sessionSecret } from "@/lib/contest/env";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import { clientKey } from "@/lib/contest/rate-limit";
import {
  SESSION_COOKIE,
  newSessionId,
  sessionCookieOptions,
  signSession,
} from "@/lib/contest/session";

/**
 * `POST /api/admin/session` — organizer sign-in; `DELETE` — sign-out.
 *
 * Google sign-in restricted to the school domain is the preferred story (docs/PRD.md §4), but a
 * fallback that works with no internet has to exist, and on the night it is the one that runs.
 * The passcode lives in the environment — never in source — and is compared in constant time
 * behind a rate limit.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const input = await readJson(request, AdminLoginSchema);

    authenticateAdmin(input, clientKey(request), now);

    const response = jsonOk({ role: "ADMIN" as const }, NO_STORE);
    response.cookies.set(
      SESSION_COOKIE,
      signSession(
        {
          sid: newSessionId(),
          role: "ADMIN",
          participantId: null,
          contestId: null,
          displayName: "Organizer",
          issuedAtMs: now.getTime(),
        },
        sessionSecret(),
      ),
      sessionCookieOptions(),
    );
    return response;
  });
}

export async function DELETE(): Promise<NextResponse> {
  return handle(async () => {
    const response = jsonOk({ role: null }, NO_STORE);
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return response;
  });
}
