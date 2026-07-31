import type { Page } from "@playwright/test";

import { SESSION_COOKIE } from "@/lib/contest/session";
import { issueSession } from "@/lib/contest/session-store";

import { testDb } from "./seed";

/**
 * Put a browser test into a competitor session without a join code.
 *
 * ## Why this exists
 *
 * Join codes are gone from every student-facing surface: a student signs in with Google or
 * GitHub, and an organizer puts them on a team. That left the test suite with a problem, because
 * roughly a hundred specs used `/join` to obtain a session, and a browser cannot complete a real
 * Google consent screen in CI.
 *
 * So the tests mint the session the same way the OAuth callback does — `issueSession` with a
 * participant — and hand the cookie to the browser. The seam is drawn exactly where the provider
 * ends and this application begins: everything downstream of the consent screen is the real code
 * path, and only the consent screen is skipped.
 *
 * ## Why the session carries participantId AND contestId
 *
 * `viewerFromSession` returns ANONYMOUS for a COMPETITOR session missing either. A helper that
 * minted a session from a user alone would sign the test in and then authorize it as nobody —
 * which is precisely the bug this project shipped in the OAuth callback, so the helper that
 * replaces the join flow had better not reproduce it.
 */

export interface CompetitorSession {
  readonly participantId: string;
  readonly displayName: string;
  readonly contestId: string;
}

let seq = 0;

/**
 * Create a participant in `contestId` and sign the page in as them.
 *
 * `teamId` is left null: team membership is decided in the organizer's roster and nowhere else,
 * so a test that wants a team must go through the admin routes like an organizer would.
 */
export async function signInAsCompetitor(
  page: Page,
  contestId: string,
  options: { displayName?: string; divisionId?: string | null; chosenSetId?: string | null } = {},
): Promise<CompetitorSession> {
  seq += 1;
  const displayName = options.displayName ?? `E2E Student ${String(Date.now())}-${String(seq)}`;

  const participant = await testDb().participant.create({
    data: {
      contestId,
      displayName,
      divisionId: options.divisionId ?? null,
      chosenSetId: options.chosenSetId ?? null,
      teamId: null,
    },
    select: { id: true },
  });

  const session = await issueSession(
    {
      role: "COMPETITOR",
      // The method a signed-up student's session actually carries. Recorded honestly so the live
      // sessions screen does not show a row claiming a sign-in path that no longer exists.
      method: "GOOGLE",
      displayName,
      participantId: participant.id,
      contestId,
    },
    new Date(),
  );

  await page.context().addCookies([
    {
      name: SESSION_COOKIE,
      value: session.token,
      // Matches `sessionCookieOptions()`. `secure` is false because the test server is http;
      // production sets it from the environment and refuses to boot with it off.
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);

  // The competitor UI also keeps a client-side record of who it thinks you are, read from
  // sessionStorage on first paint. Without it the lobby renders its signed-out state for a beat
  // and specs race that first frame.
  await page.addInitScript(
    ([id, name]) => {
      window.sessionStorage.setItem(
        "ptcn.participant",
        JSON.stringify({ participantId: id, displayName: name }),
      );
    },
    [participant.id, displayName] as const,
  );

  return { participantId: participant.id, displayName, contestId };
}
