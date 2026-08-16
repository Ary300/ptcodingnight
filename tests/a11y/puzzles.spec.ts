import { expect, test } from "@playwright/test";

import { auditPage } from "./helpers/audit";
import { openLobby } from "./helpers/journey";

/**
 * G9 — the puzzle board, which is the one competitor screen a student uses INSTEAD of the editor.
 *
 * That makes it the screen most likely to be opened by somebody who is not confident with a
 * computer, and it is a page of nothing but forms: six inputs whose only visible label is the
 * heading above them, and a result line that has to be announced rather than merely coloured. Both
 * of those are places an unlabelled control hides, so the board gets its own audit rather than
 * riding along in the general competitor sweep.
 */

test.describe("axe-core: the puzzle board", () => {
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
