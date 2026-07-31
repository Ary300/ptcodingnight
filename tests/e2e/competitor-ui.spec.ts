import { expect, test, type Page } from "@playwright/test";

import { loadContestFixture, readSolution, testDb } from "./helpers/seed";
import { signInAsCompetitor } from "./helpers/session";

/**
 * G7 — the journey a student actually walks, in a browser.
 *
 * join -> read problem -> run samples -> submit -> verdict -> submission history.
 *
 * ## Which backend this runs against
 *
 * **The real one, by default.** `components/contest/data/backend.ts` used to select the in-memory
 * stub unless `NEXT_PUBLIC_CONTEST_BACKEND=http`; it now selects the real API unless that variable
 * says `stub`, because an unset variable on a deployed server meant serving invented data to a
 * room full of students.
 *
 * The banner assertion below survives that change and is still the point: a run against the stub
 * must announce itself, so a demo run can never be mistaken for a contest run.
 *
 * The join code comes from the seeded fixture so the same spec passes unchanged once the UI is
 * wired to the API.
 */

const JOIN_CODE = loadContestFixture().contest.joinCode;

/**
 * Unique per call. `Participant` is unique on `(contestId, displayName)`, so a fixed name works
 * for exactly ONE test per seeded contest and every later join returns `CONFLICT` — which
 * surfaces as `waitForURL` hanging, not as "that name is taken".
 *
 * It never bit while the UI talked to the stub, because the stub accepts any name.
 */
let joinCounter = 0;
function nextDisplayName(): string {
  joinCounter += 1;
  return `E2E Browser Student ${Date.now()}-${joinCounter}`;
}

/**
 * Join, then place the participant in a division and a set.
 *
 * The join form cannot send a division — an organizer assigns those (PRD §61) — and every fixture
 * problem carries one, so a UI join sees an empty problem list until the participant is placed.
 * `pinParticipantToProblemSet` exists for the same reason on the API specs: a test about
 * something other than scoping states the scope it needs rather than depending on a coin flip.
 */
async function join(page: Page): Promise<string> {
  // The contest and the scope this participant needs, resolved BEFORE the session is minted so
  // the browser's first paint already has them. Every fixture problem carries a division and a
  // set, so a participant placed in neither sees an empty problem list — a test about something
  // other than scoping states the scope it needs rather than depending on a coin flip.
  const db = testDb();
  const contest = await db.contest.findFirst({
    where: { joinCode: JOIN_CODE },
    select: { id: true },
  });
  expect(contest, "the E2E fixture contest is missing").not.toBeNull();

  const target = await db.contestProblem.findFirst({
    where: { problem: { state: "PUBLISHED" }, contest: { joinCode: JOIN_CODE } },
    select: { divisionId: true, setId: true },
  });

  const session = await signInAsCompetitor(page, contest?.id ?? "", {
    displayName: nextDisplayName(),
    divisionId: target?.divisionId ?? null,
    chosenSetId: target?.setId ?? null,
  });

  await page.goto("/contest");
  return session.displayName;
}

test.describe("the competitor journey in a browser", () => {
  test("a student joins, reads a problem, runs the samples, and submits", async ({ page }) => {
    const displayName = await join(page);

    // --- lobby ---------------------------------------------------------------
    await expect(page.getByRole("heading", { name: "Problems", level: 1 })).toBeVisible();
    // Scoped to the banner, because the intent is "the chrome shows who you are signed in as".
    // Unscoped, this raced the standings poll: once the student's own row lands in the
    // leaderboard the same name is on the page twice and strict mode — correctly — refuses to
    // guess which one was meant. The header is the one this assertion is about.
    await expect(page.getByRole("banner").getByText(displayName)).toBeVisible();

    const problemLinks = page.getByRole("listitem").getByRole("link");
    await expect(problemLinks.first()).toBeVisible();
    const firstProblem = problemLinks.first();
    const problemLabel = (await firstProblem.getAttribute("aria-label")) ?? "";
    expect(problemLabel.length, "each problem row should carry an accessible name").toBeGreaterThan(0);
    await firstProblem.click();

    // --- problem -------------------------------------------------------------
    await page.waitForURL(/\/contest\/[^/]+$/);
    const title = page.getByRole("heading", { level: 1 });
    await expect(title).toBeVisible();
    await expect(page.getByRole("heading", { name: "Samples", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Constraints", level: 2 })).toBeVisible();

    const editor = page.getByRole("textbox", { name: /^Solution for / });
    await expect(editor).toBeVisible();
    await editor.fill(readSolution("accepted.py"));

    // --- run samples: free, and it must say so -------------------------------
    await expect(page.getByText("Running samples is free. Submitting counts.")).toBeVisible();
    await page.getByRole("button", { name: "Run samples" }).click();

    const samplePanel = page.getByRole("region", { name: "Sample run" });
    await expect(samplePanel).toBeVisible();
    await expect(samplePanel.getByText("Sample runs are free and are not scored.")).toBeVisible();
    await expect(samplePanel.getByText("Sample 1")).toBeVisible();

    // --- submit --------------------------------------------------------------
    await page.getByRole("button", { name: "Submit for judging" }).click();

    const verdictPanel = page.getByRole("region", { name: "Verdict" });
    await expect(verdictPanel).toBeVisible();
    // The chip in the header, not the per-test rows — every row carries a verdict word too.
    await expect(
      verdictPanel
        .locator("header")
        .getByText(/Accepted|Wrong answer|Too slow|Out of memory|Runtime error|Did not compile/),
    ).toBeVisible({ timeout: 60_000 });

    // A hidden test may show pass/fail and timing, and must say that is all it will show.
    await expect(
      verdictPanel.getByText(/Hidden tests report pass\/fail and timing only/),
    ).toBeVisible();

    // --- history -------------------------------------------------------------
    await page.getByRole("link", { name: "My submissions" }).click();
    await page.waitForURL("**/submissions");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("a signed-out visitor is offered SIGN-IN rather than bounced to it", async ({ page }) => {
    await page.goto("/contest");

    await expect(page.getByRole("heading", { name: "You are not in the contest yet" })).toBeVisible();

    // Sign-in, not a join code. Codes are gone from every student-facing surface: team membership
    // is decided only in the organizer's roster, and a student's route in is Google or GitHub.
    await expect(page.getByRole("link", { name: "Sign in to compete" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /join.*code|contest code/i }),
      "no student-facing surface may offer a join code",
    ).toHaveCount(0);

    expect(new URL(page.url()).pathname, "no redirect race on the sessionStorage read").toBe(
      "/contest",
    );
  });

  test("a screen showing invented data says so", async ({ page }) => {
    await join(page);

    const banner = page.getByText(/wired to .*, not a live contest/);
    // Live is the DEFAULT now; the stub is opt-in. An unset variable used to mean "stub", which
    // meant a deployment with nothing set served invented data.
    const live = process.env.NEXT_PUBLIC_CONTEST_BACKEND !== "stub";

    if (live) {
      await expect(banner, "a live-backend run must not show the demo banner").toHaveCount(0);
    } else {
      await expect(
        banner,
        "the stub backend must announce itself, or a demo run reads as a contest run",
      ).toBeVisible();
    }
  });

  test("the projector shows the TEAM board by default", async ({ page }) => {
    // Teams are what Coding Night ranks (PRD §6.1), so the bare URL must land on the team board.
    // This spec previously asserted the individual board's heading and division tabs, and passed
    // right up until teams became the default — a stale assertion that would have let the room see
    // the wrong board.
    await page.goto("/projector");

    await expect(page.getByRole("heading", { name: /team standings/i })).toBeVisible();
    // Either the board, or an honest reason there is none. A projector that renders nothing and
    // says nothing is the one outcome that must not happen.
    await expect(
      page
        .getByRole("table", { name: /team standings/i })
        .or(page.getByRole("status"))
        .first(),
    ).toBeVisible();
  });

  test("the projector still offers the individual board for the ICPC preset", async ({ page }) => {
    // ?mode=individual is not dead code: the ICPC preset ranks players against each other and has
    // no teams to total. If this ever 404s or renders the team board, that preset has no display.
    await page.goto("/projector?mode=individual");

    await expect(page.getByRole("heading", { name: "Park Tudor Coding Night" })).toBeVisible();
    // Live or frozen, the board always states which it is — the room reads this from ten metres.
    await expect(page.getByText(/^(Live|Board frozen)$/)).toBeVisible();
  });
});

/**
 * The two pieces of chrome taken from HackerRank that are interactive rather than decorative:
 * the challenge-list filter rail and the account menu.
 *
 * Both are the kind of thing that looks finished in a screenshot and is broken in use — a filter
 * that renders but does not filter, a menu that opens but whose items are invisible. The second
 * of those actually happened here: the panel is a paper surface inside a header that sets
 * `text-paper`, so every item without its own colour was white on white. It looked like an empty
 * menu, and only "Sign out" showed because it specifies `text-panther`.
 */
test.describe("the problem filters actually filter", () => {
  test("Solved and Unsolved narrow the list, and the count says by how much", async ({ page }) => {
    await join(page);

    // Scoped to the named list: the page also carries a standings card full of list items, and
    // `getByRole("listitem")` unscoped would count those too.
    const rows = page.getByRole("list", { name: "Problems" }).getByRole("listitem");
    // Awaited before counting. `count()` does not auto-wait, so counting straight after the
    // navigation raced the lobby's fetch and reported zero problems every time.
    await expect(rows.first()).toBeVisible();
    const total = await rows.count();
    expect(total, "the fixture should publish at least one problem").toBeGreaterThan(0);

    // Nothing is ticked to begin with. A filter that arrives pre-applied is the reason people
    // think a list is broken.
    await expect(page.getByRole("checkbox", { name: "Solved", exact: true })).not.toBeChecked();
    await expect(page.getByText(`${String(total)} problems`)).toBeVisible();

    await page.getByRole("checkbox", { name: "Unsolved" }).check();
    await expect(rows).toHaveCount(total);
    await expect(page.getByText(`Showing ${String(total)} of ${String(total)}`)).toBeVisible();

    // Nothing is solved in a fresh join, so this must empty the list AND say why.
    await page.getByRole("checkbox", { name: "Unsolved" }).uncheck();
    await page.getByRole("checkbox", { name: "Solved", exact: true }).check();
    await expect(rows).toHaveCount(0);
    await expect(page.getByText(/No problems match those filters/)).toBeVisible();
    await expect(page.getByText(`Showing 0 of ${String(total)}`)).toBeVisible();

    // Unticking restores it. A filter you cannot get out of is worse than no filter.
    await page.getByRole("checkbox", { name: "Solved", exact: true }).uncheck();
    await expect(rows).toHaveCount(total);
  });
});

test.describe("the account menu", () => {
  test("opens, its items are VISIBLE, and Escape closes it", async ({ page }) => {
    await join(page);

    const trigger = page.getByRole("button", { name: /▾|competitor|menu/i }).or(
      page.locator('header button[aria-haspopup="menu"]'),
    );
    await trigger.first().click();

    const menu = page.getByRole("menu", { name: "Account" });
    await expect(menu).toBeVisible();

    // toBeVisible() is the assertion that would have caught white-on-white: an element with no
    // colour contrast is still "visible" to Playwright, so the items are checked for a real
    // computed colour as well.
    for (const label of ["Problems", "My team", "My submissions", "Live standings"]) {
      await expect(menu.getByRole("menuitem", { name: label })).toBeVisible();
    }
    const colour = await menu
      .getByRole("menuitem", { name: "My team" })
      .evaluate((node) => window.getComputedStyle(node).color);
    expect(colour, "a menu item must not inherit the dark bar's paper text").not.toBe(
      "rgb(251, 249, 248)",
    );

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });
});


test.describe("the organizer can get in", () => {
  /*
    THE LOCKOUT THIS PINS.

    `POST /api/admin/session` existed, was tested, and **nothing in the browser posted to it.**
    That was survivable for as long as `/admin/**` rendered for anybody who typed the URL. The
    moment the console got a server-side gate it became a lockout — and the other door, an
    email-and-password `User` with `role: "ADMIN"`, is created by no seed script and no sign-up
    path. A fresh deployment therefore had two ways into the organizer console: an account
    nothing creates, and a route nothing calls.

    It would not have failed anything. Every admin API spec mints its session with
    `adminLogin()`, which posts to the route directly — exactly the thing a browser could not do.
    So this asserts the BROWSER path, by clicking.
  */
  test("signs in with the passcode and lands on the console", async ({ page }) => {
    const passcode = process.env.ADMIN_PASSCODE ?? "";
    expect(passcode, "ADMIN_PASSCODE is required for this spec").not.toBe("");

    await page.goto("/sign-in");

    // Collapsed by default: a passcode field open on the front door invites the room to try it.
    const disclosure = page.getByText("Organizer passcode", { exact: true });
    await expect(disclosure).toBeVisible();
    await expect(page.getByLabel("Passcode")).toBeHidden();

    await disclosure.click();
    await page.getByLabel("Passcode").fill(passcode);
    await page.getByRole("button", { name: /organizer console/i }).click();

    await page.waitForURL(/\/admin/);
    await expect(page.getByRole("navigation", { name: "Admin sections" })).toBeVisible();
  });

  test("a wrong passcode is refused and stays on the page", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByText("Organizer passcode", { exact: true }).click();
    await page.getByLabel("Passcode").fill("not-the-passcode");
    await page.getByRole("button", { name: /organizer console/i }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("/admin is refused to somebody with no organizer session", async ({ browser }) => {
    // A fresh context: no cookies from the specs above.
    const context = await browser.newContext();
    const fresh = await context.newPage();
    await fresh.goto("/admin");

    // Redirected to sign-in, not rendered. The console used to draw in full for anybody, with a
    // single refused panel in it, which reads as a door that is nearly open.
    await expect(fresh).toHaveURL(/\/sign-in/);
    await expect(fresh.getByRole("navigation", { name: "Admin sections" })).toHaveCount(0);
    await context.close();
  });
});
