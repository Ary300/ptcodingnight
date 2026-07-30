import { expect, test } from "@playwright/test";

import { auditPage } from "./helpers/audit";
import { openLobby, openProblem } from "./helpers/journey";

/**
 * G9 — axe-core on the three surfaces PRD §12 names: competitor, problem, projector.
 *
 * Also the join screen and the submissions history, because they are on the same walk and a
 * student who cannot get through the join screen never reaches the ones that were audited.
 */

test.describe("axe-core: zero critical or serious", () => {
  test("join", async ({ page }) => {
    await page.goto("/join");
    await expect(page.getByRole("heading", { name: "Join the contest" })).toBeVisible();
    await auditPage(page, "/join");

    // Second step of the form is a different DOM and has to be audited as one.
    await page.getByLabel("Join code").fill("E2E-PANTHER");
    await page.locator("form").getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByLabel("Display name")).toBeVisible();
    await auditPage(page, "/join (display name step)");
  });

  test("competitor lobby", async ({ page }) => {
    await openLobby(page);
    await auditPage(page, "/contest");
  });

  test("problem workspace", async ({ page }) => {
    await openProblem(page);
    await auditPage(page, "/contest/[slug]");
  });

  test("problem workspace with a verdict on screen", async ({ page }) => {
    await openProblem(page);

    // The verdict panel is `--ink` ground with `--paper` text — the inverse of every other
    // competitor surface, and the one place gold/rise/fall are used at all. Auditing the page
    // without it would skip the contrast that is hardest to get right.
    await page.getByRole("button", { name: "Run samples" }).click();
    await expect(page.getByRole("region", { name: "Sample run" })).toBeVisible();
    await auditPage(page, "/contest/[slug] (sample results)");

    await page.getByRole("button", { name: "Submit for judging" }).click();
    const verdict = page.getByRole("region", { name: "Verdict" });
    await expect(verdict).toBeVisible();
    await expect(
      verdict
        .locator("header")
        .getByText(/Accepted|Wrong answer|Too slow|Out of memory|Runtime error|Did not compile/),
    ).toBeVisible({ timeout: 60_000 });
    await auditPage(page, "/contest/[slug] (verdict)");
  });

  test("my submissions", async ({ page }) => {
    await openLobby(page);
    await page.getByRole("link", { name: "My submissions" }).click();
    await page.waitForURL("**/submissions");
    await auditPage(page, "/submissions");
  });

  /**
   * The heading is `Team standings`, not `Park Tudor Coding Night`.
   *
   * These two asserted the individual board's heading and kept asserting it after teams became the
   * default at `/projector` (b5efe9e). That is not a cosmetic staleness — an assertion for a
   * heading that no longer exists fails on the *first line* of the test, so **the audit below it
   * never ran**, and the projector board the room stares at for an hour was silently unaudited at
   * both projector resolutions while the gate reported the reason as a missing heading.
   */
  test("projector", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/projector");
    await expect(page.getByRole("heading", { name: /team standings/i })).toBeVisible();
    await auditPage(page, "/projector");
  });

  test("projector at the smaller of the two projector resolutions", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/projector");
    await expect(page.getByRole("heading", { name: /team standings/i })).toBeVisible();
    await auditPage(page, "/projector @1280x720");
  });
});

test.describe("competitor surfaces are usable at 360px (DESIGN.md §7)", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test("nothing on the problem page overflows the viewport horizontally", async ({ page }) => {
    await openProblem(page);
    await auditPage(page, "/contest/[slug] @360px");

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
    });

    // A student on a phone should never have to scroll sideways to reach Submit.
    expect(
      overflow.scrollWidth,
      `the page is ${overflow.scrollWidth}px wide in a ${overflow.clientWidth}px viewport`,
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });

  test("the lobby fits too", async ({ page }) => {
    await openLobby(page);
    await auditPage(page, "/contest @360px");
  });
});
