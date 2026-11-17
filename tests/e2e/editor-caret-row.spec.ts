import { expect, test, type Locator, type Page } from "@playwright/test";

import { chooseLanguage } from "./helpers/language";
import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7, in a browser: the caret-row tint covers exactly the caret's line.
 *
 * The tint is positioned by arithmetic (padding plus rows above it) while the text and the gutter
 * are laid out by the browser, so the two only agree when the arithmetic uses the pitch the browser
 * actually lays rows out at. A fractional pitch (16px x 1.3 = 20.8px) drifted a fraction of a pixel
 * a row, and in an engine that lays rows at whole pixels it reached most of a row by line 17. Each
 * case measures the tint against the gutter's number for that line and against the bracket mark
 * the overlay draws on that line's own text, at two font sizes, after scrolling a long file, and
 * in both layouts.
 *
 * Runs as a practice guest on the arena's first warm-up. Needs `npx tsx scripts/seed-practice.ts`.
 */

test.describe.configure({ mode: "serial" });

const SLUG = "practice-two-sum";
const TOLERANCE_PX = 1;

let paused: PausedContest[] = [];
let title = "";

test.beforeAll(async () => {
  paused = await pauseLiveContests();
  const row = await testDb().contestProblem.findFirst({
    where: {
      problem: { slug: SLUG },
      contest: { isPractice: true, state: "RUNNING" },
    },
    select: { problem: { select: { title: true } } },
  });
  expect(row, "no practice arena: run `npx tsx scripts/seed-practice.ts` first").not.toBeNull();
  title = row?.problem.title ?? "";
});

test.afterAll(async () => {
  await restoreContests(paused);
  await closeTestDb();
});

/** 120 lines; every fourth line from 1 is `if(a + b > 0) {` with its `}` on the next line. */
const LINES = Array.from({ length: 120 }, (_, index) => {
  switch (index % 4) {
    case 0:
      return "        if(a + b > 0) {";
    case 1:
      return "        }";
    case 2:
      return `        // line ${index + 1}, with "a string" and 42`;
    default:
      return "        int x = a * b;";
  }
});
const CODE = LINES.join("\n");

function editor(page: Page): Locator {
  return page.getByRole("textbox", {
    name: new RegExp(`^Solution for ${title}`),
  });
}

async function openWithCode(page: Page): Promise<Locator> {
  await page.goto("/join");
  await page.getByRole("button", { name: "Practice" }).click();
  await page.waitForURL("**/contest");
  await page.goto(`/contest/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await chooseLanguage(page, "Java 21");
  const textarea = editor(page);
  await textarea.click();
  await textarea.fill(CODE);
  return textarea;
}

/** The caret just after the `{` that ends `line` (1-based), reported the way an arrow key would. */
async function caretAfterBrace(page: Page, textarea: Locator, line: number): Promise<void> {
  await textarea.evaluate((element, target) => {
    const area = element as HTMLTextAreaElement;
    const rows = area.value.split("\n");
    let offset = 0;
    for (let index = 0; index < target - 1; index += 1) offset += (rows[index] ?? "").length + 1;
    offset += (rows[target - 1] ?? "").length;
    area.focus();
    area.setSelectionRange(offset, offset);
    // Bring the row into view the way moving the caret with the keys would.
    const pitch = Number.parseFloat(getComputedStyle(area).lineHeight);
    const top = (target - 1) * pitch;
    if (top < area.scrollTop || top + pitch > area.scrollTop + area.clientHeight) {
      area.scrollTop = Math.max(0, top - area.clientHeight / 2);
    }
  }, line);
  await page.keyboard.press("Shift");
}

interface Geometry {
  readonly band: { top: number; bottom: number } | null;
  readonly gutterRow: { top: number; bottom: number };
  readonly braceMiddle: number | null;
  readonly scrollTop: number;
}

async function geometry(textarea: Locator, line: number): Promise<Geometry> {
  return textarea.evaluate((element, target) => {
    const area = element as HTMLTextAreaElement;
    const wrapper = area.parentElement;
    const gutter = wrapper?.previousElementSibling;
    const overlay = wrapper?.querySelector("[data-caret-row]")?.parentElement ?? null;
    const band = overlay?.querySelector(`[data-caret-row="${target}"]`)?.getBoundingClientRect() ?? null;
    const row = gutter?.children[target - 1]?.getBoundingClientRect();
    const braces = Array.from(overlay?.querySelectorAll('[data-mark~="bracket-match"]') ?? []);
    const open = braces.find((node) => node.textContent === "{")?.getBoundingClientRect() ?? null;
    return {
      band: band === null ? null : { top: band.top, bottom: band.bottom },
      gutterRow: {
        top: row?.top ?? Number.NaN,
        bottom: row?.bottom ?? Number.NaN,
      },
      braceMiddle: open === null ? null : (open.top + open.bottom) / 2,
      scrollTop: area.scrollTop,
    };
  }, line);
}

async function expectBandOnLine(page: Page, textarea: Locator, line: number, label: string): Promise<Geometry> {
  await caretAfterBrace(page, textarea, line);
  const overlay = textarea.locator("xpath=..").locator(`[data-caret-row="${line}"]`);
  await expect(overlay, `${label}: the tint is on line ${line}`).toHaveCount(1);
  // The matched-brace marks settle after a short pause; wait for the `{` on this line.
  await expect(textarea.locator("xpath=..").locator('[data-mark~="bracket-match"]')).toHaveCount(2);
  const measured = await geometry(textarea, line);
  expect(measured.band, label).not.toBeNull();
  const band = measured.band ?? { top: 0, bottom: 0 };
  expect(Math.abs(band.top - measured.gutterRow.top), `${label}: tint top vs gutter row top`).toBeLessThanOrEqual(
    TOLERANCE_PX,
  );
  expect(
    Math.abs(band.bottom - measured.gutterRow.bottom),
    `${label}: tint bottom vs gutter row bottom`,
  ).toBeLessThanOrEqual(TOLERANCE_PX);
  // And on the text: the `{` the overlay marks on this line sits inside the tint, centred.
  expect(measured.braceMiddle, `${label}: the matched { is drawn`).not.toBeNull();
  const middle = measured.braceMiddle ?? Number.NaN;
  expect(
    Math.abs(middle - (band.top + band.bottom) / 2),
    `${label}: tint centre vs the line's text`,
  ).toBeLessThanOrEqual(TOLERANCE_PX + 1);
  return measured;
}

async function biggerFont(page: Page, steps: number): Promise<void> {
  const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
  for (let step = 0; step < steps; step += 1) await page.keyboard.press(`${mac ? "Meta" : "Control"}+Equal`);
}

async function checkEverywhere(page: Page, textarea: Locator, layout: string): Promise<void> {
  await expectBandOnLine(page, textarea, 17, `${layout}, default size, line 17`);
  const far = await expectBandOnLine(page, textarea, 101, `${layout}, default size, line 101`);
  expect(far.scrollTop, `${layout}: line 101 is reached by scrolling`).toBeGreaterThan(0);

  const sizeBefore = await textarea.evaluate((element) => getComputedStyle(element).fontSize);
  await biggerFont(page, 3);
  await expect.poll(() => textarea.evaluate((element) => getComputedStyle(element).fontSize)).not.toBe(sizeBefore);
  await expectBandOnLine(page, textarea, 17, `${layout}, larger size, line 17`);
  await expectBandOnLine(page, textarea, 101, `${layout}, larger size, line 101`);
}

test("the caret-row tint covers exactly the caret's line, stacked", async ({ page }, testInfo) => {
  const textarea = await openWithCode(page);
  await expect(page.getByRole("separator", { name: "Resize the problem and the editor" })).toHaveCount(0);
  await checkEverywhere(page, textarea, "stacked");

  await caretAfterBrace(page, textarea, 17);
  await page.keyboard.press("Shift");
  await textarea.locator("xpath=../..").screenshot({ path: testInfo.outputPath("caret-row-stacked.png") });
});

test.describe("on a window wide enough for two panes", () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  });

  test("the caret-row tint covers exactly the caret's line, side by side", async ({ page }, testInfo) => {
    const textarea = await openWithCode(page);
    await page
      .getByRole("group", { name: "Layout" })
      .getByRole("button", { name: "Side by side", exact: true })
      .click();
    await expect(
      page.getByRole("separator", {
        name: "Resize the problem and the editor",
      }),
    ).toBeVisible();
    await checkEverywhere(page, textarea, "side by side");

    await caretAfterBrace(page, textarea, 17);
    await textarea.locator("xpath=../..").screenshot({ path: testInfo.outputPath("caret-row-side.png") });
  });
});
