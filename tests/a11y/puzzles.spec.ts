import { expect, test } from "@playwright/test";

import { testDb } from "../e2e/helpers/seed";
import { auditPage } from "./helpers/audit";
import { openLobby } from "./helpers/journey";

/**
 * G9 — the puzzle board, which is the one competitor screen a student uses INSTEAD of the editor.
 *
 * That makes it the screen most likely to be opened by somebody who is not confident with a
 * computer, and it is a page of nothing but forms: one input per visible puzzle whose only visible
 * label is the heading above it, and a result line that has to be announced rather than merely
 * coloured. Both of those are places an unlabelled control hides, so the board gets its own audit
 * rather than riding along in the general competitor sweep.
 *
 * The journey's student is placed on the set that holds the live problem, so the board lists that
 * seat's puzzle plus any open to everyone. At least one card is present whenever the puzzles have
 * been seeded, which is what the "Check my answer" wait below depends on.
 */

test.describe("axe-core: the puzzle board", () => {
  /*
    `seed-puzzles` creates every puzzle HIDDEN since the night moved to paper puzzles (organizer
    decision, 2026-11-16), so a freshly seeded database has an empty board and this audit would
    have nothing to look at. Show the seeded puzzles for the length of this file, and put back
    exactly the ones that were hidden, so the audit never changes what an organizer chose.
  */
  let shown: string[] = [];

  test.beforeAll(async () => {
    const hidden = await testDb().puzzle.findMany({ where: { active: false }, select: { id: true } });
    shown = hidden.map((row) => row.id);
    if (shown.length > 0) {
      await testDb().puzzle.updateMany({ where: { id: { in: shown } }, data: { active: true } });
    }
  });

  test.afterAll(async () => {
    if (shown.length > 0) {
      await testDb().puzzle.updateMany({ where: { id: { in: shown } }, data: { active: false } });
    }
  });

  test("the list, reached by clicking rather than by URL", async ({ page }) => {
    await openLobby(page);
    await page.getByRole("link", { name: "Puzzles" }).click();
    await page.waitForURL("**/contest/puzzles");
    await expect(page.getByRole("heading", { name: "Puzzles", level: 1 })).toBeVisible();

    // Wait for the list, not the heading: the heading renders while the fetch is in flight, and
    // auditing an empty page reports it as clean.
    await expect(page.getByRole("button", { name: "Check my answer" }).first()).toBeVisible();
    await auditPage(page, "/contest/puzzles");
  });

  test("with a wrong answer announced", async ({ page }) => {
    await openLobby(page);
    await page.goto("/contest/puzzles");

    const answer = page.getByRole("textbox").first();
    await answer.fill("definitely not the answer");
    await page.getByRole("button", { name: "Check my answer" }).first().click();

    // A result line is a live region in `--panther`, which is the pairing DESIGN.md warns about,
    // and a message nobody can read is this screen's whole purpose failing quietly.
    await expect(page.getByRole("status").filter({ hasText: /Not that one/ })).toBeVisible();
    await auditPage(page, "/contest/puzzles (wrong answer)");
  });

  test("the board fits a phone without scrolling the document sideways", async ({ page }) => {
    // A student who is doing puzzles rather than problems is the likeliest person here to be on a
    // phone, and the sudoku prompt is a nine-column code block, which is the widest thing on any
    // competitor screen.
    await page.setViewportSize({ width: 360, height: 780 });
    await openLobby(page);
    await page.goto("/contest/puzzles");
    await expect(page.getByRole("button", { name: "Check my answer" }).first()).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      overflow.scrollWidth,
      `/contest/puzzles is ${String(overflow.scrollWidth)}px wide in a ${String(overflow.clientWidth)}px viewport`,
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);

    await auditPage(page, "/contest/puzzles @360px");
  });
});
