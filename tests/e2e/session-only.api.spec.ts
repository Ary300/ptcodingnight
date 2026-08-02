import { expect, test } from "@playwright/test";

import { mintCompetitorSession } from "./helpers/session";
import { closeTestDb, seedE2EContest } from "./helpers/seed";

/**
 * THE COOKIE ALONE MUST BE ENOUGH.
 *
 * This is the bug the verification agent found: the competitor UI read its identity from a
 * `sessionStorage` record that nothing in the product ever wrote, so a student with a perfectly
 * valid session cookie was told "You are not in the contest yet" on every screen, forever.
 *
 * The suites missed it because their own helpers wrote that record. So this spec deliberately
 * does NOT: it sets the cookie the OAuth callback sets, and nothing else.
 */
test("a session cookie alone gets a student into the contest", async ({ browser }) => {
  const seeded = await seedE2EContest();
  const session = await mintCompetitorSession(seeded.contestId, {
    displayName: `CookieOnly ${Date.now()}`,
    divisionId: seeded.divisionIds.get("intermediate") ?? null,
  });

  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "ptcn_session",
      value: session.cookie.split("=")[1] ?? "",
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();
  await page.goto("/contest");

  await expect(
    page.getByText(/not in the contest yet|not in a contest yet|Sign in to compete/i),
    "a signed-in student was told to sign in",
  ).toHaveCount(0);

  /*
    And the problems actually ARRIVE.

    Asserting only that the "not in the contest" gate is gone would pass against a lobby stuck on
    "Loading problems…" forever — which is exactly what a broken `currentContestId()` would look
    like now that it no longer throws. The list is the proof that the client resolved its contest
    from the cookie and completed a contest-scoped read.
  */
  await expect(page.getByText(/Loading problems/i)).toHaveCount(0, { timeout: 15_000 });
  // The fixture's group problem, which is what a student with no team can see — one problem, not
  // none. `1 problems` is the count the list prints, and it is the proof that a contest-scoped
  // read completed rather than that a skeleton rendered.
  await expect(
    page.getByRole("link", { name: /E2E Group Problem/i }).first(),
    "the lobby never loaded a problem",
  ).toBeVisible({ timeout: 15_000 });

  // And the standings loaded too — a second contest-scoped read, through the chrome rather than
  // the page, which is where the old synchronous throw used to take the whole React tree down.
  await expect(page.getByText(/TIME REMAINING/i)).toBeVisible();

  // The student is also NAMED — the chrome reads the display name off the same session.
  // `.first()`: the name appears in the account menu AND in the standings row marked "you" —
  // both of which are the session being read correctly, which is the point.
  await expect(page.getByText(/CookieOnly/).first()).toBeVisible();

  await context.close();
  await closeTestDb();
});
