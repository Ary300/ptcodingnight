import type { APIRequestContext, Page, PlaywrightWorkerArgs } from "@playwright/test";

import { JoinResponseSchema } from "@/lib/schemas/api";
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

  /*
    The competitor UI keeps its own record of who it thinks you are, and it PARSES it.

    `components/contest/data/participant.ts` validates sessionStorage against JoinResponseSchema —
    "storage is a trust boundary like any other" — and returns null on any mismatch, which the UI
    renders as signed out. A partial record therefore does not half-work; it fails silently and the
    lobby shows "You are not in the contest yet" with a valid session cookie sitting right there.

    So this writes the WHOLE shape, and it is built from the schema's own fields rather than from
    memory of them.
  */
  const record = {
    participantId: participant.id,
    contestId,
    displayName,
    divisionId: options.divisionId ?? null,
    chosenSetId: options.chosenSetId ?? null,
    chosenSetLabel: null,
    // True: this helper deliberately leaves the participant teamless, because an organizer is the
    // only thing that puts anybody on a team.
    needsTeam: true,
    rejoined: false,
  };
  const parsed = JoinResponseSchema.safeParse(record);
  if (!parsed.success) {
    // Fail here, loudly, rather than let every spec behind this helper audit a signed-out page.
    throw new Error(
      `signInAsCompetitor built a record JoinResponseSchema rejects: ${parsed.error.message}`,
    );
  }

  await page.addInitScript((value: string) => {
    window.sessionStorage.setItem("ptcn.participant", value);
  }, JSON.stringify(record));

  return { participantId: participant.id, displayName, contestId };
}


/**
 * The API-side twin of `signInAsCompetitor`, for specs that drive HTTP directly.
 *
 * An `APIRequestContext`'s cookies cannot be mutated after it is created, so the session has to
 * exist BEFORE the context does — which is why this returns a new context rather than signing an
 * existing one in. That is a Playwright constraint rather than a design choice, and it is the
 * reason the old `api.joinOrThrow(...)` shape could not simply be reimplemented.
 */
export interface CompetitorApiContext {
  readonly request: APIRequestContext;
  readonly participantId: string;
  readonly displayName: string;
  readonly cookie: string;
}

export async function newCompetitorContext(
  playwright: PlaywrightWorkerArgs["playwright"],
  contestId: string,
  options: {
    displayName?: string;
    divisionId?: string | null;
    chosenSetId?: string | null;
    baseURL?: string;
  } = {},
): Promise<CompetitorApiContext> {
  seq += 1;
  const displayName = options.displayName ?? `E2E Api ${String(Date.now())}-${String(seq)}`;

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
      method: "GOOGLE",
      displayName,
      participantId: participant.id,
      contestId,
    },
    new Date(),
  );

  const cookie = `${SESSION_COOKIE}=${session.token}`;
  const request = await playwright.request.newContext({
    baseURL: options.baseURL,
    extraHTTPHeaders: { cookie },
  });

  return { request, participantId: participant.id, displayName, cookie };
}


/**
 * Create a participant and mint their session, returning the cookie.
 *
 * The one place a competitor session is made in tests. `signInAsCompetitor` hands the cookie to a
 * browser context; `ContestApi.signIn` sends it as a header. Both need the participant to exist
 * BEFORE the session references it, because a COMPETITOR session without a participantId resolves
 * to an anonymous viewer — the bug the OAuth callback shipped.
 */
export async function mintCompetitorSession(
  contestId: string,
  options: { displayName?: string; divisionId?: string | null; chosenSetId?: string | null } = {},
): Promise<{ participantId: string; displayName: string; token: string; cookie: string }> {
  seq += 1;
  const displayName = options.displayName ?? `E2E Api ${String(Date.now())}-${String(seq)}`;

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
    { role: "COMPETITOR", method: "GOOGLE", displayName, participantId: participant.id, contestId },
    new Date(),
  );

  return {
    participantId: participant.id,
    displayName,
    token: session.token,
    cookie: `${SESSION_COOKIE}=${session.token}`,
  };
}
