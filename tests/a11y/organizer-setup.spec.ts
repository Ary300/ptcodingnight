import { expect, test } from "@playwright/test";

import { auditPage } from "./helpers/audit";
import { runningContestId, signInAsOrganizer } from "./helpers/journey";

/**
 * G9 — the organizer setup flow, which had no a11y coverage at all.
 *
 * The suite audited exactly one admin screen (`/admin/side-activities`). The contest list, the
 * create form and the per-contest shell were unaudited, and the shell is the part most likely to
 * carry a mistake: it is a breadcrumb, a heading, a state pill and a seven-item tab strip, which is
 * four separate chances to encode position with colour alone or to leave a landmark unnamed.
 *
 * The restructure that made this necessary is also the one that makes it pass. Five copies of a
 * "Which contest?" picker became one list; the contest's identity is an h1 rather than an
 * invisible query parameter; and `TabStrip` marks the current tab with `aria-current="page"`,
 * never with the underline alone.
 *
 * `runningContestId` rather than a hardcoded id: a fixture id changes on every reseed, and a spec
 * pinned to a stale one fails as "no data" long after the real cause has scrolled away.
 */

test.describe("axe-core: the organizer setup flow", () => {
  test("the contest list", async ({ page }) => {
    await signInAsOrganizer(page);
    await page.goto("/admin");

    // Wait for the LIST, not just the heading. The heading renders while the fetch is in flight,
    // so auditing on it would audit an empty page and report it as clean.
    await expect(page.getByRole("region", { name: /all contests/i })).toBeVisible();
    await auditPage(page, "/admin (contest list)");
  });

  test("the create form", async ({ page }) => {
    await signInAsOrganizer(page);
    await page.goto("/admin/contests/new");
    await expect(page.getByLabel("Contest name")).toBeVisible();

    await auditPage(page, "/admin/contests/new");
  });

  test("a contest's setup checklist", async ({ page }) => {
    await signInAsOrganizer(page);
    const contestId = await runningContestId(page);
    await page.goto(`/admin/contests/${contestId}/setup`);

    await expect(page.getByRole("navigation", { name: "Contest sections" })).toBeVisible();
    await auditPage(page, "/admin/contests/{id}/setup");
  });

  test("the tab strip marks the current tab with more than a colour", async ({ page }) => {
    await signInAsOrganizer(page);
    const contestId = await runningContestId(page);
    await page.goto(`/admin/contests/${contestId}/teams`);

    const tabs = page.getByRole("navigation", { name: "Contest sections" }).getByRole("link");
    // Eight since the join-slip printing tab landed. The count is here so a tab that silently
    // disappears fails something; the property the test is actually about is below.
    await expect(tabs).toHaveCount(8);

    // Exactly one tab is current, and it is the one whose path we are on. The Setup tab has its
    // own `/setup` segment precisely so that the bare contest URL is not a prefix of all five
    // siblings — without it, every tab would carry `aria-current="page"` at once.
    const current = tabs.and(page.locator('[aria-current="page"]'));
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute("href", `/admin/contests/${contestId}/teams`);
  });

  /*
    The puzzle screen is a data table whose last column is a button per row, which is the shape
    that most often ships with nothing but a colour to say which state a row is in. Here the button
    says "Hide" or "Show", so the state is in its name.
  */
  test("the puzzle list", async ({ page }) => {
    await signInAsOrganizer(page);
    await page.goto("/admin/puzzles");

    await expect(page.getByRole("heading", { name: "Puzzles", level: 1 })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await auditPage(page, "/admin/puzzles");
  });

  /*
    The projected code wall, at both projector resolutions.

    It is the one organizer screen a whole room reads, so it is audited the way the standings board
    is: at 1920x1080 and again at 1280x720, because the two differ by a scale factor and a floor
    that holds at one size can fail at the other. The blackout is audited too — it is a full-screen
    cover with the only way back written on it.
  */
  test("the code wall at 1920x1080", async ({ page }) => {
    await signInAsOrganizer(page);
    const contestId = await runningContestId(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/wall/${contestId}`);

    // Wait for the fetch, not the heading: auditing the loading state audits nothing.
    await expect(page.getByRole("button", { name: /Hide screen/ })).toBeVisible();
    await auditPage(page, "/wall/{id} @1920x1080");
  });

  test("the code wall at 1280x720, and its blackout", async ({ page }) => {
    await signInAsOrganizer(page);
    const contestId = await runningContestId(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`/wall/${contestId}`);
    await expect(page.getByRole("button", { name: /Hide screen/ })).toBeVisible();
    await auditPage(page, "/wall/{id} @1280x720");

    await page.getByRole("button", { name: /Hide screen/ }).click();
    await expect(page.getByRole("region", { name: "Screen hidden" })).toBeVisible();
    await auditPage(page, "/wall/{id} (blacked out)");
  });

  test("the contest shell survives 360px without overflowing the document", async ({ page }) => {
    await signInAsOrganizer(page);
    const contestId = await runningContestId(page);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`/admin/contests/${contestId}/setup`);
    await expect(page.getByRole("navigation", { name: "Contest sections" })).toBeVisible();

    // Seven tabs do not fit at 360px. `TabStrip` scrolls the STRIP; if that ever becomes the
    // document scrolling instead, an organizer on a phone drags the whole layout off screen —
    // the same defect the team board shipped (DESIGN.md §7).
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      overflow.scrollWidth,
      `the contest shell overflows the viewport at 360px: ${String(overflow.scrollWidth)} > ${String(overflow.clientWidth)}`,
    ).toBeLessThanOrEqual(overflow.clientWidth);

    await auditPage(page, "/admin/contests/{id}/setup at 360px");
  });
});
