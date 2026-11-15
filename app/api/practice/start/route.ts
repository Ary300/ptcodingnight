import type { NextResponse } from "next/server";

import { DomainError } from "@/lib/errors";
import { NO_STORE, handle, jsonOk } from "@/lib/contest/http";
import {
  assertPracticeOpen,
  contestFacts,
  createGuestParticipant,
  findPracticeArena,
  planPracticeStart,
  refusalMessage,
  throttlePracticeStart,
} from "@/lib/contest/practice-guest";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/contest/session";
import { issueSession } from "@/lib/contest/session-store";
import { viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/practice/start` — try the practice problems as a guest, with no join code.
 *
 * Creates a fresh participant called "Guest NNNN" in the practice arena and signs the browser in
 * as that participant, with the same session row and the same cookie the join-code door issues.
 * The policy for a browser that is already signed in lives in `planPracticeStart`:
 *
 *  - anonymous: a new guest, 200 `{ displayName, created: true }` plus the session cookie;
 *  - already in the arena: the same session again, 200 `{ displayName, created: false }`, no
 *    new row and no new cookie;
 *  - signed in to a real contest, or as an organizer: 409 `CONFLICT` with a sentence that says to
 *    sign out first. Nothing is replaced, so a student cannot lose the night's session by pressing
 *    the practice button.
 *
 * The request takes no body; there is nothing for a guest to choose.
 *
 * The session method is `JOIN_CODE` because the `AuthMethod` enum has no guest value, and this
 * is the same kind of session: a competitor with no account behind it. Adding an enum value is a
 * migration for a label that only the audit trail reads.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const viewer = await viewerFromRequest(request, now);

    const current = viewer.kind === "competitor" ? await contestFacts(viewer.contestId) : null;
    const plan = planPracticeStart(viewer, current?.isPractice ?? null);

    if (plan.kind === "refuse-contest" || plan.kind === "refuse-organizer") {
      throw new DomainError("CONFLICT", refusalMessage(plan, current?.name ?? null));
    }
    if (plan.kind === "reuse") {
      return jsonOk({ displayName: plan.displayName, created: false }, NO_STORE);
    }

    await assertPracticeOpen(now);
    const arena = await findPracticeArena(now);
    throttlePracticeStart(request, now);
    const guest = await createGuestParticipant(arena.id);

    const session = await issueSession(
      {
        role: "COMPETITOR",
        method: "JOIN_CODE",
        displayName: guest.displayName,
        participantId: guest.participantId,
        contestId: guest.contestId,
      },
      now,
    );

    const response = jsonOk({ displayName: guest.displayName, created: true }, NO_STORE);
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions());
    return response;
  });
}
