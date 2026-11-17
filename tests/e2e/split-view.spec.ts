import { expect, test, type Locator, type Page } from "@playwright/test";

import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7, in a browser: the problem page's side-by-side layout, HackerRank's test editor.
 *
 * - side by side is a full-window workspace under the top bar: no page column, no page scroll,
 *   statement pane left at 40%, editor pane right, Submit pinned to the bottom edge;
 * - stacked is the default on every width, side by side is one click away on the toggle, and
 *   the student's own choice wins wherever two panes fit, across a reload;
 * - the divider runs the full height, moves by pointer drag and by the arrow keys, stays inside
 *   25-75%, and the position survives a reload;
 * - Run examples opens the Results drawer, the drawer folds, and the editor stays on screen;
 * - below 1024px the page is stacked and the toggle is not offered, whatever was chosen;
 * - the editor still takes typing in the split.
 *
 * Runs as a practice guest on the arena's first warm-up. Needs the arena
 * (`npx tsx scripts/seed-practice.ts`). The drawer test starts a sample run; it asserts on the
 * drawer, not on the judge's answer.
 */

test.describe.configure({ mode: "serial" });

const SLUG = "practice-two-sum";
const LAYOUT_KEY = "ptcn.problem-layout.v1";

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

/** Side by side is one click away; every test of the split starts with that click. */
async function chooseSideBySide(page: Page): Promise<void> {
  await layoutButton(page, "Side by side").click();
  await expect(layoutButton(page, "Side by side")).toHaveAttribute("aria-pressed", "true");
  await expect(divider(page)).toBeVisible();
}

function divider(page: Page): Locator {
  return page.getByRole("separator", { name: "Resize the problem and the editor" });
}

function editor(page: Page): Locator {
  return page.getByRole("textbox", { name: new RegExp(`^Solution for ${title}`) });
}

function resultsToggle(page: Page): Locator {
  return page.getByRole("region", { name: "Results" }).getByRole("button", { name: /^Results/ });
}

async function splitValue(page: Page): Promise<number> {
  return Number(await divider(page).getAttribute("aria-valuenow"));
}

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const measured = await locator.boundingBox();
  expect(measured).not.toBeNull();
  return measured ?? { x: 0, y: 0, width: 0, height: 0 };
}

async function pageScrolls(page: Page): Promise<{ vertical: number; horizontal: number }> {
  return page.evaluate(() => ({
    vertical: document.documentElement.scrollHeight - window.innerHeight,
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
}

test.describe("on a wide window", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test("stacked is the default even this wide; side by side fills the window under the top bar", async ({ page }) => {
    await openProblemAsGuest(page);

    await expect(layoutButton(page, "Stacked")).toHaveAttribute("aria-pressed", "true");
    await expect(divider(page)).toHaveCount(0);

    await chooseSideBySide(page);
    await expect(divider(page)).toHaveAttribute("aria-valuenow", "40");

    // Edge to edge, from the bottom of the top bar to the bottom of the window.
    const bar = await box(page.getByRole("banner"));
    const statementPane = page.getByRole("region", { name: "Problem statement" });
    const solutionPane = page.getByRole("region", { name: "Your solution" });
    const left = await box(statementPane);
    const right = await box(solutionPane);
    expect(left.x).toBe(0);
    expect(Math.abs(left.y - (bar.y + bar.height))).toBeLessThan(1);
    expect(Math.abs(left.y + left.height - 900)).toBeLessThan(1);
    expect(Math.abs(right.x + right.width - 1440)).toBeLessThan(1);
    expect(Math.abs(right.y - left.y)).toBeLessThan(1);
    expect(Math.abs(left.width / 1440 - 0.4)).toBeLessThan(0.02);

    // The divider is the full height of the workspace.
    const rule = await box(divider(page));
    expect(Math.abs(rule.height - left.height)).toBeLessThan(1);

    // The page itself never scrolls.
    expect(await pageScrolls(page)).toEqual({ vertical: 0, horizontal: 0 });

    // A compact header: the problem named once, as "P1 (Title)" at statement-heading size.
    const heading = page.getByRole("heading", { level: 1, name: title });
    await expect(heading).toHaveText(/^\S+ \(.+\)$/);
    const size = await heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeLessThanOrEqual(20);
    await expect(statementPane.getByRole("tablist", { name: "Problem views" })).toBeVisible();
    await expect(statementPane.getByRole("group", { name: "Layout" })).toBeVisible();

    // Language tabs on top of the editor pane, Run and Submit pinned to its bottom edge.
    await expect(solutionPane.getByRole("tablist", { name: "Language" })).toBeVisible();
    const submit = await box(page.getByRole("button", { name: "Submit for judging" }));
    expect(submit.y + submit.height).toBeLessThanOrEqual(900);
    expect(submit.y + submit.height).toBeGreaterThan(900 - 24);
    const run = await box(page.getByRole("button", { name: "Run examples" }));
    expect(run.x).toBeGreaterThan(right.x + right.width / 2);
    expect(submit.x).toBeGreaterThan(run.x);

    // The editor takes the pane's height rather than its own 22rem floor.
    expect((await box(editor(page))).height).toBeGreaterThan(400);
    expect(await editor(page).evaluate((el) => getComputedStyle(el).resize)).toBe("none");

    // Each pane scrolls by itself: scrolling the statement leaves the editor where it was.
    const editorTop = (await box(editor(page))).y;
    await statementPane.locator("[data-split-scroll]").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect((await box(editor(page))).y).toBe(editorTop);
  });

  test("the student's choice wins over the default and survives a reload", async ({ page }) => {
    await openProblemAsGuest(page);

    // Chosen and then un-chosen, so "Stacked" below is a click and not the default.
    await chooseSideBySide(page);
    await layoutButton(page, "Stacked").click();
    await expect(layoutButton(page, "Stacked")).toHaveAttribute("aria-pressed", "true");
    await expect(divider(page)).toHaveCount(0);
    // Stacked is the page as it always was: the centred column, the 40px title, the page scrolls.
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(title);
    const size = await page
      .getByRole("heading", { level: 1, name: title })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThan(30);
    expect(await editor(page).evaluate((el) => getComputedStyle(el).resize)).toBe("vertical");
    expect((await pageScrolls(page)).vertical).toBeGreaterThan(0);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(layoutButton(page, "Stacked")).toHaveAttribute("aria-pressed", "true");
    await expect(divider(page)).toHaveCount(0);

    await layoutButton(page, "Side by side").click();
    await expect(divider(page)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(layoutButton(page, "Side by side")).toHaveAttribute("aria-pressed", "true");
    await expect(divider(page)).toBeVisible();
  });

  test("the divider moves by drag and by arrow keys, within 25 to 75 percent", async ({ page }) => {
    await openProblemAsGuest(page);
    await chooseSideBySide(page);

    const separator = divider(page);
    await expect(separator).toHaveAttribute("aria-orientation", "vertical");
    await expect(separator).toHaveAttribute("aria-valuemin", "25");
    await expect(separator).toHaveAttribute("aria-valuemax", "75");
    await expect(separator).toHaveAttribute("aria-valuenow", "40");

    const statementPane = page.getByRole("region", { name: "Problem statement" });
    const widthBefore = (await box(statementPane)).width;

    // Drag 200px right.
    const handle = await box(separator);
    const startX = handle.x + handle.width / 2;
    const startY = handle.y + handle.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 100, startY, { steps: 5 });
    await page.mouse.move(startX + 200, startY, { steps: 5 });
    await page.mouse.up();
    const afterDrag = await splitValue(page);
    expect(afterDrag).toBeGreaterThan(50);
    expect(afterDrag).toBeLessThanOrEqual(75);
    expect((await box(statementPane)).width).toBeGreaterThan(widthBefore + 150);

    // A drag far past the edge stops at the bound.
    const moved = await box(separator);
    await page.mouse.move(moved.x + moved.width / 2, startY);
    await page.mouse.down();
    await page.mouse.move(5, startY, { steps: 8 });
    await page.mouse.up();
    await expect(separator).toHaveAttribute("aria-valuenow", "25");

    // Keyboard: the separator takes focus, with a visible ring, and the arrows step 5%.
    await separator.focus();
    await page.keyboard.press("ArrowRight");
    await expect(separator).toHaveAttribute("aria-valuenow", "30");
    await page.keyboard.press("ArrowRight");
    await expect(separator).toHaveAttribute("aria-valuenow", "35");
    await page.keyboard.press("ArrowLeft");
    await expect(separator).toHaveAttribute("aria-valuenow", "30");
    await page.keyboard.press("End");
    await expect(separator).toHaveAttribute("aria-valuenow", "75");
    await page.keyboard.press("ArrowRight");
    await expect(separator).toHaveAttribute("aria-valuenow", "75");
    await page.keyboard.press("Home");
    await expect(separator).toHaveAttribute("aria-valuenow", "25");
    await page.keyboard.press("ArrowRight");
    await expect(separator).toHaveAttribute("aria-valuenow", "30");

    // Tab away and back, so `:focus-visible` reflects the keyboard rather than the last click.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(separator).toBeFocused();
    expect(await separator.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");

    await page.reload();
    await expect(divider(page)).toHaveAttribute("aria-valuenow", "30");
  });

  test("Run examples opens the Results drawer, which folds without moving the editor off screen", async ({ page }) => {
    await openProblemAsGuest(page);
    await chooseSideBySide(page);

    const toggle = resultsToggle(page);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Nothing has run, so the header is the word and nothing else.
    await expect(toggle).toHaveText("Results");

    await page.getByRole("button", { name: "Run examples" }).click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    // Open, the drawer sits between the editor and the action bar and the editor keeps its room.
    const drawer = await box(page.getByRole("region", { name: "Results" }));
    const code = await box(editor(page));
    const submit = await box(page.getByRole("button", { name: "Submit for judging" }));
    expect(code.y + code.height).toBeLessThanOrEqual(drawer.y + 1);
    expect(drawer.y + drawer.height).toBeLessThanOrEqual(submit.y);
    expect(code.height).toBeGreaterThan(200);
    expect(drawer.height).toBeLessThanOrEqual((900 - 52) * 0.45 + 1);
    expect(submit.y + submit.height).toBeLessThanOrEqual(900);
    expect(await pageScrolls(page)).toEqual({ vertical: 0, horizontal: 0 });

    // By keyboard, the drawer folds and unfolds.
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect((await box(editor(page))).height).toBeGreaterThan(code.height);
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  test("the bottom of the editor pane is a slim status bar and a copy-free action bar", async ({ page }) => {
    await openProblemAsGuest(page);
    await chooseSideBySide(page);
    const solutionPane = page.getByRole("region", { name: "Your solution" });

    // No sentence of help on screen; the textarea still carries it for screen readers. Measured
    // as a box, because Playwright counts screen-reader-only text (a 1px clip) as "visible".
    for (const text of [/Tab indents/, /^Running examples is free\. Submitting counts\.$/]) {
      const copy = solutionPane.getByText(text);
      await expect(copy).toHaveCount(1);
      const size = await box(copy);
      expect(size.width * size.height, `${String(text)} is on screen`).toBeLessThanOrEqual(1);
    }
    // Escape TWICE: one Escape is an IntelliJ reflex and must not arm the exit.
    await expect(editor(page)).toHaveAccessibleDescription(/Press Escape twice, then Tab/);
    await expect(page.getByRole("button", { name: "Run examples" })).toHaveAccessibleDescription(
      "Running examples is free. Submitting counts.",
    );
    await expect(solutionPane.getByText(/^Ln \d+, Col \d+$/)).toBeVisible();
    // `exact`: the visually hidden file input behind it is "Upload code as file".
    await expect(page.getByRole("button", { name: "Upload code", exact: true })).toBeVisible();

    // The shortcuts popover opens by keyboard, lists the way out of the editor first, and
    // Escape closes it with focus back on its button.
    const shortcuts = page.getByRole("button", { name: "Keyboard shortcuts" });
    await shortcuts.focus();
    await page.keyboard.press("Enter");
    await expect(shortcuts).toHaveAttribute("aria-expanded", "true");
    const panel = page.getByRole("region", { name: "Keyboard shortcuts" });
    await expect(panel).toBeVisible();
    await expect(panel.locator("dd").first()).toHaveText("Move focus out of the editor");
    await page.keyboard.press("Escape");
    await expect(shortcuts).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    await expect(shortcuts).toBeFocused();
  });

  test("the editor still takes typing side by side", async ({ page }) => {
    await openProblemAsGuest(page);
    await chooseSideBySide(page);

    const textarea = editor(page);
    await textarea.click();
    await textarea.fill("");
    await page.keyboard.type("int answer = 42;");
    await expect(textarea).toHaveValue("int answer = 42;");
    await expect(textarea).toBeFocused();
  });

  test("crossing 1024px keeps the same editor: focus, caret and undo survive", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await openProblemAsGuest(page);
    await layoutButton(page, "Side by side").click();
    await expect(divider(page)).toBeVisible();

    const textarea = editor(page);
    await textarea.click();
    await textarea.fill("");
    await page.keyboard.type("int a = 1;");
    // Tag the node: a rebuilt textarea would not carry the mark.
    await textarea.evaluate((element) => element.setAttribute("data-probe", "same-node"));

    // Snapping the window to half a screen drops it below the split's breakpoint.
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(divider(page)).toHaveCount(0);
    await expect(textarea).toHaveAttribute("data-probe", "same-node");
    await expect(textarea).toBeFocused();
    expect(await textarea.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(
      "int a = 1;".length,
    );

    // Undo still reaches what was typed BEFORE the switch: a rebuilt textarea has no history.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(textarea).not.toHaveValue("int a = 1;");
  });

  test("the toggle keeps the editor's undo history", async ({ page }) => {
    await openProblemAsGuest(page);
    await layoutButton(page, "Side by side").click();
    const textarea = editor(page);
    await textarea.click();
    await textarea.fill("");
    await page.keyboard.type("int b = 2;");

    await layoutButton(page, "Stacked").click();
    await expect(divider(page)).toHaveCount(0);
    await textarea.click();
    await page.keyboard.press("End");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(textarea).not.toHaveValue("int b = 2;");
  });

  test("examples fit the problem pane at the divider's narrowest", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openProblemAsGuest(page);
    await layoutButton(page, "Side by side").click();
    await divider(page).focus();
    await page.keyboard.press("Home");
    // 25, the side-by-side workspace's lower bound (it was 30 in the old in-column split).
    await expect(divider(page)).toHaveAttribute("aria-valuenow", "25");

    const pane = page.getByRole("region", { name: "Problem statement" });
    await pane.getByText("Example 1", { exact: true }).click();
    const copy = pane.getByRole("button", { name: /^Copy example 1/ });
    await expect(copy.first()).toBeVisible();

    // Nothing in the pane spills sideways, and each Copy button sits inside it.
    const overflow = await pane.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const paneBox = await box(pane);
    for (const button of await copy.all()) {
      const buttonBox = await box(button);
      expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(paneBox.x + paneBox.width + 1);
    }
  });
});

test.describe("between 1024 and 1280", () => {
  test.use({ viewport: { width: 1100, height: 800 }, isMobile: false, hasTouch: false });

  test("stacked is the default, and side by side is offered", async ({ page }) => {
    await openProblemAsGuest(page);
    await expect(layoutButton(page, "Stacked")).toHaveAttribute("aria-pressed", "true");
    await expect(divider(page)).toHaveCount(0);

    await layoutButton(page, "Side by side").click();
    await expect(divider(page)).toBeVisible();
    expect(await pageScrolls(page)).toEqual({ vertical: 0, horizontal: 0 });
    const submit = await box(page.getByRole("button", { name: "Submit for judging" }));
    expect(submit.y + submit.height).toBeLessThanOrEqual(800);
  });
});

test.describe("on a narrow window", () => {
  test.use({ viewport: { width: 900, height: 900 } });

  test("the page stays stacked and the toggle is not offered", async ({ page }) => {
    // A student who chose side by side on a laptop, then opens the page on something narrower.
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, "side");
    }, LAYOUT_KEY);
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
