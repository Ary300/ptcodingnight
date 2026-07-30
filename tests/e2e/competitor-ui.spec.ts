import { expect, test, type Page } from "@playwright/test";

import { loadContestFixture, readSolution, testDb } from "./helpers/seed";

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
  const displayName = nextDisplayName();
  await page.goto("/join");

  await expect(page.getByRole("heading", { name: "Join the contest" })).toBeVisible();

  await page.getByLabel("Join code").fill(JOIN_CODE);
  // Scoped to the form: the dev server injects a "Next.js Dev Tools" button whose accessible
  // name also starts with "Next", and an ambiguous locator here would look like a UI bug.
  await page.locator("form").getByRole("button", { name: "Next", exact: true }).click();

  await page.getByLabel("Display name").fill(displayName);
  await page.getByRole("button", { name: "Join the contest" }).click();

  await page.waitForURL("**/contest");

  const raw = await page.evaluate(() => window.sessionStorage.getItem("ptcn.participant"));
  const stored = JSON.parse(raw ?? "{}") as { participantId?: string };
  expect(stored.participantId, "the join did not record a participant").toBeTruthy();

  const db = testDb();
  const target = await db.contestProblem.findFirst({
    where: { problem: { state: "PUBLISHED" }, contest: { joinCode: JOIN_CODE } },
    select: { divisionId: true, setId: true },
  });
  await db.participant.update({
    where: { id: stored.participantId ?? "" },
    data: { divisionId: target?.divisionId ?? null, chosenSetId: target?.setId ?? null },
  });

  await page.reload();
  return displayName;
}

test.describe("the competitor journey in a browser", () => {
  test("a student joins, reads a problem, runs the samples, and submits", async ({ page }) => {
    const displayName = await join(page);

    // --- lobby ---------------------------------------------------------------
    await expect(page.getByRole("heading", { name: "Problems", level: 1 })).toBeVisible();
    await expect(page.getByText(displayName)).toBeVisible();

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

  test("an un-joined visitor is offered the join screen rather than bounced to it", async ({
    page,
  }) => {
    await page.goto("/contest");

    await expect(page.getByRole("heading", { name: "You are not in the contest yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Join the contest" })).toBeVisible();
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
