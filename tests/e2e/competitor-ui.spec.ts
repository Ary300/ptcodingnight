import { expect, test, type Page } from "@playwright/test";

import { loadContestFixture, readSolution } from "./helpers/seed";

/**
 * G7 — the journey a student actually walks, in a browser.
 *
 * join -> read problem -> run samples -> submit -> verdict -> submission history.
 *
 * ## Which backend this runs against
 *
 * Whichever one the server is configured with. `components/contest/data/backend.ts` selects the
 * in-memory stub unless `NEXT_PUBLIC_CONTEST_BACKEND=http`, and when the stub is in play the
 * chrome renders a "Demo data" banner — which this spec asserts on, so a run can never be
 * mistaken for a live-contest run.
 *
 * That the app cannot presently be pointed at the real API is a defect, and it is asserted
 * directly by `wiring.api.spec.ts` rather than left implicit here. This file's job is narrower
 * and still worth having: the screens, the two-step join, the two buttons that are deliberately
 * not the same button, and the verdict panel all work under a real browser.
 *
 * The join code comes from the seeded fixture so the same spec passes unchanged once the UI is
 * wired to the API.
 */

const JOIN_CODE = loadContestFixture().contest.joinCode;
const DISPLAY_NAME = "E2E Browser Student";

async function join(page: Page): Promise<void> {
  await page.goto("/join");

  await expect(page.getByRole("heading", { name: "Join the contest" })).toBeVisible();

  await page.getByLabel("Join code").fill(JOIN_CODE);
  // Scoped to the form: the dev server injects a "Next.js Dev Tools" button whose accessible
  // name also starts with "Next", and an ambiguous locator here would look like a UI bug.
  await page.locator("form").getByRole("button", { name: "Next", exact: true }).click();

  await page.getByLabel("Display name").fill(DISPLAY_NAME);
  await page.getByRole("button", { name: "Join the contest" }).click();

  await page.waitForURL("**/contest");
}

test.describe("the competitor journey in a browser", () => {
  test("a student joins, reads a problem, runs the samples, and submits", async ({ page }) => {
    await join(page);

    // --- lobby ---------------------------------------------------------------
    await expect(page.getByRole("heading", { name: "Problems", level: 1 })).toBeVisible();
    await expect(page.getByText(DISPLAY_NAME)).toBeVisible();

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
    const live = process.env.NEXT_PUBLIC_CONTEST_BACKEND === "http";

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
