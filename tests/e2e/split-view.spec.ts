import { expect, test, type Locator, type Page } from "@playwright/test";

import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7, in a browser: the problem page's side-by-side layout.
 *
 * - the toggle beside the Problem / My submissions tabs switches between Stacked and Side by
 *   side, and the choice survives a reload;
 * - the divider moves by pointer drag and by the arrow keys, stays inside 30-70%, and the
 *   position survives a reload;
 * - below 1024px the page is stacked and the toggle is not offered, whatever was chosen;
 * - the editor still takes typing in the split, and fills its pane.
 *
 * Runs as a practice guest on the arena's first warm-up. Needs the arena
 * (`npx tsx scripts/seed-practice.ts`). No judge is involved.
 */

test.describe.configure({ mode: "serial" });

const SLUG = "practice-two-sum";

let paused: PausedContest[] = [];
let title = "";

test.beforeAll(async () => {
  // Practice is closed while any real contest is live; the e2e database always has one.
  paused = await pauseLiveContests();
  const row = await testDb().contestProblem.findFirst({
    where: { problem: { slug: SLUG }, contest: { isPractice: true, state: "RUNNING" } },
    select: { problem: { select: { title: true } } },
  });
  expect(row, "no practice arena: run `npx tsx scripts/seed-practice.ts` first").not.toBeNull();
  title = row?.problem.title ?? "";
});

test.afterAll(async () => {
  await restoreContests(paused);
  await closeTestDb();
});

async function openProblemAsGuest(page: Page): Promise<void> {
  await page.goto("/join");
  await page.getByRole("button", { name: "Practice" }).click();
  await page.waitForURL("**/contest");
  await page.goto(`/contest/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

function layoutButton(page: Page, name: "Stacked" | "Side by side"): Locator {
  return page.getByRole("group", { name: "Layout" }).getByRole("button", { name, exact: true });
}

function divider(page: Page): Locator {
  return page.getByRole("separator", { name: "Resize the problem and the editor" });
}

function editor(page: Page): Locator {
  return page.getByRole("textbox", { name: new RegExp(`^Solution for ${title}`) });
}

async function splitValue(page: Page): Promise<number> {
  return Number(await divider(page).getAttribute("aria-valuenow"));
}

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const measured = await locator.boundingBox();
  expect(measured).not.toBeNull();
  return measured ?? { x: 0, y: 0, width: 0, height: 0 };
}

test.describe("on a wide window", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test("the toggle switches the layout and the choice survives a reload", async ({ page }) => {
    await openProblemAsGuest(page);

    // Stacked by default: the toggle is offered, Stacked is pressed, and there is no divider.
    await expect(layoutButton(page, "Stacked")).toHaveAttribute("aria-pressed", "true");
    await expect(layoutButton(page, "Side by side")).toHaveAttribute("aria-pressed", "false");
    await expect(divider(page)).toHaveCount(0);
    await expect(editor(page)).toBeVisible();
    // Stacked keeps the editor's own sizing: a drag handle and the 70vh cap.
    expect(await editor(page).evaluate((el) => getComputedStyle(el).resize)).toBe("vertical");

    await layoutButton(page, "Side by side").click();
    await expect(layoutButton(page, "Side by side")).toHaveAttribute("aria-pressed", "true");
    await expect(divider(page)).toBeVisible();

    // Statement left, solution right, level with each other.
    const statementPane = page.getByRole("region", { name: "Problem statement" });
    const solutionPane = page.getByRole("region", { name: "Your solution" });
    const left = await box(statementPane);
    const right = await box(solutionPane);
    expect(right.x).toBeGreaterThan(left.x + left.width - 1);
    expect(Math.abs(right.y - left.y)).toBeLessThan(2);

    // The split fills the window below its top, so Submit is on screen without scrolling the
    // page, and the editor takes the pane's height rather than its own 22rem floor.
    const submit = page.getByRole("button", { name: "Submit for judging" });
    const submitBox = await box(submit);
    expect(submitBox.y + submitBox.height).toBeLessThanOrEqual(900);
    expect((await box(editor(page))).height).toBeGreaterThan(352);
    expect(await editor(page).evaluate((el) => getComputedStyle(el).resize)).toBe("none");

    // Each pane scrolls by itself: scrolling the statement leaves the page where it was.
    const scrollY = await page.evaluate(() => window.scrollY);
    await statementPane.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    await expect(editor(page)).toBeInViewport();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(layoutButton(page, "Side by side")).toHaveAttribute("aria-pressed", "true");
    await expect(divider(page)).toBeVisible();

    await layoutButton(page, "Stacked").click();
    await expect(divider(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(layoutButton(page, "Stacked")).toHaveAttribute("aria-pressed", "true");
    await expect(divider(page)).toHaveCount(0);
  });

  test("the divider moves by drag and by arrow keys, within 30 to 70 percent", async ({ page }) => {
    await openProblemAsGuest(page);
    await layoutButton(page, "Side by side").click();

    const separator = divider(page);
    await expect(separator).toHaveAttribute("aria-orientation", "vertical");
    await expect(separator).toHaveAttribute("aria-valuemin", "30");
    await expect(separator).toHaveAttribute("aria-valuemax", "70");
    await expect(separator).toHaveAttribute("aria-valuenow", "50");

    const statementPane = page.getByRole("region", { name: "Problem statement" });
    const widthBefore = (await box(statementPane)).width;

    // Drag 200px left.
    const handle = await box(separator);
    const startX = handle.x + handle.width / 2;
    const startY = handle.y + handle.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 100, startY, { steps: 5 });
    await page.mouse.move(startX - 200, startY, { steps: 5 });
    await page.mouse.up();
    const afterDrag = await splitValue(page);
    expect(afterDrag).toBeLessThan(45);
    expect(afterDrag).toBeGreaterThanOrEqual(30);
    expect((await box(statementPane)).width).toBeLessThan(widthBefore - 150);

    // A drag far past the edge stops at the bound.
    const moved = await box(separator);
    await page.mouse.move(moved.x + moved.width / 2, startY);
    await page.mouse.down();
    await page.mouse.move(5, startY, { steps: 8 });
    await page.mouse.up();
    await expect(separator).toHaveAttribute("aria-valuenow", "30");

    // Keyboard: the separator takes focus, with a visible ring, and the arrows step 5%.
    await separator.focus();
    await page.keyboard.press("ArrowRight");
    await expect(separator).toHaveAttribute("aria-valuenow", "35");
    await page.keyboard.press("ArrowRight");
    await expect(separator).toHaveAttribute("aria-valuenow", "40");
    await page.keyboard.press("ArrowLeft");
    await expect(separator).toHaveAttribute("aria-valuenow", "35");
    await page.keyboard.press("End");
    await expect(separator).toHaveAttribute("aria-valuenow", "70");
    await page.keyboard.press("ArrowRight");
    await expect(separator).toHaveAttribute("aria-valuenow", "70");
    await page.keyboard.press("Home");
    await expect(separator).toHaveAttribute("aria-valuenow", "30");
    await page.keyboard.press("ArrowRight");
    await expect(separator).toHaveAttribute("aria-valuenow", "35");

    // Tab away and back, so `:focus-visible` reflects the keyboard rather than the last click.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(separator).toBeFocused();
    expect(await separator.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");

    await page.reload();
    await expect(divider(page)).toHaveAttribute("aria-valuenow", "35");
  });

  test("the editor still takes typing side by side", async ({ page }) => {
    await openProblemAsGuest(page);
    await layoutButton(page, "Side by side").click();
    await expect(divider(page)).toBeVisible();

    const textarea = editor(page);
    await textarea.click();
    await textarea.fill("");
    await page.keyboard.type("int answer = 42;");
    await expect(textarea).toHaveValue("int answer = 42;");
    await expect(textarea).toBeFocused();
  });
});

test.describe("on a narrow window", () => {
  test.use({ viewport: { width: 900, height: 900 } });

  test("the page stays stacked and the toggle is not offered", async ({ page }) => {
    // A student who chose side by side on a laptop, then opens the page on something narrower.
    await page.addInitScript(() => {
      window.localStorage.setItem("ptcn.problem-layout.v1", "side");
    });
    await openProblemAsGuest(page);

    await expect(page.getByRole("group", { name: "Layout" })).toHaveCount(0);
    await expect(divider(page)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Your solution" })).toBeVisible();
    await expect(editor(page)).toBeVisible();

    // Widening the same window brings the remembered split back.
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(divider(page)).toBeVisible();
    await expect(layoutButton(page, "Side by side")).toHaveAttribute("aria-pressed", "true");

    // And narrowing it again drops back to stacked.
    await page.setViewportSize({ width: 1000, height: 900 });
    await expect(divider(page)).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Layout" })).toHaveCount(0);
  });
});
