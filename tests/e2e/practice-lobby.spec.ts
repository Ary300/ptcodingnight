import { expect, test } from "@playwright/test";

import { ContestApi, waitForVerdict } from "./helpers/api";
import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7, in a browser: what a practice guest sees in the lobby.
 *
 * The arena used to show a standings card of a dozen rows, all "Guest", all tied on zero, plus
 * "My team" and "Puzzles" tabs that led to empty pages. This pins the replacement: no other guest
 * anywhere on the page, no tabs without anything behind them, a generated avatar instead of a
 * red "G", and a "Your practice" card whose numbers move when the guest solves a warm-up through
 * the real judge.
 *
 * Needs the arena (`npx tsx scripts/seed-practice.ts`), and the worker plus Docker for the judged
 * step, like `practice-guest.api.spec.ts`.
 */

const VERDICT_BUDGET_MS = 120_000;
const TWO_SUM_SOLUTION = "a, b = map(int, input().split())\nprint(a + b)\n";

test.describe.configure({ mode: "serial" });

let paused: PausedContest[] = [];
let arenaId = "";

test.beforeAll(async () => {
  // Practice is closed while any real contest is live; the e2e database always has one.
  paused = await pauseLiveContests();
  const arena = await testDb().contest.findFirst({
    where: { isPractice: true, state: "RUNNING" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  expect(arena, "no practice arena: run `npx tsx scripts/seed-practice.ts` first").not.toBeNull();
  arenaId = arena?.id ?? "";
});

test.afterAll(async () => {
  await restoreContests(paused);
  await closeTestDb();
});

test("a practice guest sees no other guests, no team tabs, and progress that counts a real solve", async ({
  page,
}) => {
  test.setTimeout(VERDICT_BUDGET_MS + 60_000);

  await page.goto("/join");
  await page.getByRole("button", { name: "Practice" }).click();
  await page.waitForURL("**/contest");

  await expect(page.getByRole("heading", { name: "Practice problems", level: 1 })).toBeVisible();
  const card = page.getByRole("region", { name: "Your practice" });
  await expect(card).toBeVisible();

  // --- nobody else is on the page --------------------------------------------------------------
  await expect(page.getByRole("region", { name: "Standings" })).toHaveCount(0);
  await expect(page.locator("table")).toHaveCount(0);
  // "Guest" appears exactly once, and it is the viewer's own label in the header.
  const main = page.locator("main");
  await expect(main.getByText(/Guest/)).toHaveCount(0);
  await expect(page.locator("header").getByText("Guest", { exact: true })).toHaveCount(1);

  // --- the tabs that apply, and only those -----------------------------------------------------
  const nav = page.getByRole("navigation", { name: "Competitor" });
  await expect(nav.getByRole("link", { name: "Problems" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "My submissions" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "My team" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Puzzles" })).toHaveCount(0);

  // --- the avatar is generated, and the visible label still says Guest -------------------------
  const account = page.getByRole("button", { name: /^Account: Guest/ });
  await expect(account).toBeVisible();
  await expect(account.locator("svg[data-guest-avatar]")).toHaveCount(1);
  await expect(account.locator("svg[data-guest-avatar]")).toHaveAttribute("aria-hidden", "true");
  await account.click();
  const menu = page.getByRole("menu", { name: "Account" });
  await expect(menu.getByRole("menuitem", { name: "Problems" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "My submissions" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "My team" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // --- solve the first warm-up through the real judge ------------------------------------------
  const guest = new ContestApi(page.request, arenaId);
  const before = await guest.listProblems();
  const total = before.length;
  const twoSum = before.find((problem) => problem.slug === "practice-two-sum");
  expect(twoSum, "practice-two-sum is not in the arena").toBeDefined();
  expect(before[0]?.slug, "the first warm-up is listed first").toBe("practice-two-sum");
  const easyTotal = before.filter((problem) => problem.difficulty === "E").length;
  const possible = before.reduce((sum, problem) => sum + problem.basePoints, 0);

  const submission = await guest.submit({
    contestProblemId: twoSum?.contestProblemId ?? "",
    language: "PYTHON_312",
    sourceCode: TWO_SUM_SOLUTION,
  });
  const judged = await waitForVerdict(guest, submission.submissionId, VERDICT_BUDGET_MS);
  expect(judged.verdict).toBe("AC");

  const after = await guest.listProblems();
  const points = after.reduce((sum, problem) => sum + (problem.bestScore ?? 0), 0);
  expect(points, "an AC on a warm-up scores its points").toBeGreaterThan(0);

  await page.reload();
  await expect(card).toBeVisible();
  await expect(card.locator("[data-practice-solved]")).toHaveText(`1 of ${String(total)}`);
  await expect(card.locator("[data-practice-points]")).toHaveText(
    `${String(points)} of ${String(possible)}`,
  );
  await expect(card.locator('[data-practice-difficulty="E"]')).toContainText(
    `1 of ${String(easyTotal)}`,
  );

  // The suggestion moves on to the first problem still unsolved, in list order.
  const next = after.find((problem) => !problem.solved);
  const link = card.locator("[data-practice-next]");
  await expect(link).toHaveAttribute("href", `/contest/${next?.slug ?? ""}`);
  await expect(link).toContainText(next?.title ?? "");
});

test("the practice lobby fits a 320px phone with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/join");
  await page.getByRole("button", { name: "Practice" }).click();
  await page.waitForURL("**/contest");
  await expect(page.getByRole("region", { name: "Your practice" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
