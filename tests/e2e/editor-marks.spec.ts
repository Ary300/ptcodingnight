import { expect, test, type Locator, type Page } from "@playwright/test";

import { chooseLanguage } from "./helpers/language";
import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7, in a browser: the editor's on-screen marks, IntelliJ's matched brace, unmatched bracket,
 * usages, caret row and indent guides, plus the error lines a sample run reports and the Results
 * links that jump to them.
 *
 * The marks live in the overlay under the textarea, which is `aria-hidden`, so they are read
 * through the data attributes the overlay puts on them. The sample run's response is routed to a
 * fixed compile error so no judge is needed and the line numbers are known.
 *
 * Runs as a practice guest on the arena's first warm-up. Needs `npx tsx scripts/seed-practice.ts`.
 */

test.describe.configure({ mode: "serial" });

const SLUG = "practice-two-sum";

let paused: PausedContest[] = [];
let title = "";

test.beforeAll(async () => {
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

function editor(page: Page): Locator {
  return page.getByRole("textbox", { name: new RegExp(`^Solution for ${title}`) });
}

function overlay(page: Page): Locator {
  return page.locator("pre[aria-hidden='true']").filter({ has: page.locator("span") }).first();
}

/** Opens the problem in Java with `code` in the editor and the caret at `caret`. */
async function openWith(page: Page, code: string, caret: number): Promise<Locator> {
  await page.goto("/join");
  await page.getByRole("button", { name: "Practice" }).click();
  await page.waitForURL("**/contest");
  await page.goto(`/contest/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await chooseLanguage(page, "Java 21");
  const textarea = editor(page);
  await textarea.click();
  await textarea.fill(code);
  await placeCaret(page, textarea, caret);
  return textarea;
}

/** Puts the caret at an offset the way the arrow keys would, so the surface hears about it. */
async function placeCaret(page: Page, textarea: Locator, offset: number): Promise<void> {
  await textarea.evaluate((element, at) => {
    (element as HTMLTextAreaElement).setSelectionRange(at, at);
  }, offset);
  await page.keyboard.press("Shift");
}

test("the brace beside the caret and its partner are marked, and a stray one is drawn as an error", async ({ page }) => {
  const code = "class Main {\n    void f() {\n    }\n}\n}";
  await openWith(page, code, code.indexOf("{") + 1);

  const matched = overlay(page).locator('[data-mark~="bracket-match"]');
  await expect(matched).toHaveCount(2);
  await expect(matched).toHaveText(["{", "}"]);

  // Only after the pause, and the stray closer is the last character.
  const stray = overlay(page).locator('[data-mark~="bracket-error"]');
  await expect(stray).toHaveCount(1, { timeout: 5_000 });
  await expect(stray).toHaveText("}");
});

test("usages of the name at the caret light up, and the caret row and indent guides are drawn", async ({ page }) => {
  const code = "class Main {\n    int count = 0;\n    void f() {\n        count++;\n    }\n}";
  const textarea = await openWith(page, code, code.indexOf("count") + 2);

  const usages = overlay(page).locator('[data-mark~="usage"]');
  await expect(usages).toHaveCount(2);
  await expect(usages).toHaveText(["count", "count"]);

  await expect(overlay(page).locator("[data-caret-row]")).toHaveAttribute("data-caret-row", "2");
  await expect(overlay(page).locator("[data-indent-guide]")).toHaveCount(1);

  // The overlay still reproduces the text exactly, marks and all.
  const shown = await overlay(page).evaluate((element) => element.textContent ?? "");
  expect(shown).toBe(`${await textarea.inputValue()}\n`);
});

test("a compile error marks its line, and its reference in Results moves the caret there", async ({ page }) => {
  const code = "public class Main {\n    public static void main(String[] args) {\n        int x = 3\n    }\n}";
  await page.route("**/api/run-samples", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        error: null,
        data: {
          results: [
            {
              ordinal: 1,
              isSample: true,
              verdict: "CE",
              runtimeMs: null,
              diffSnippet: "/work/Main.java:3: error: ';' expected\n        int x = 3\n                 ^\n1 error",
            },
          ],
        },
      }),
    }),
  );
  const textarea = await openWith(page, code, 0);

  await page.getByRole("button", { name: "Run examples" }).click();
  const marker = page.locator("[data-diagnostic-line]");
  await expect(marker).toHaveAttribute("data-diagnostic-line", "3");
  await expect(marker).toHaveAttribute("title", "error: ';' expected");
  // One underline under the line's glyphs, cut into pieces by the token colours.
  const underlined = overlay(page).locator('[data-mark~="diagnostic"]');
  await expect
    .poll(() => underlined.evaluateAll((spans) => spans.map((span) => span.textContent ?? "").join("")))
    .toBe("int x = 3");

  await page.getByRole("button", { name: /^Main\.java:3, go to line 3$/ }).click();
  await expect(textarea).toBeFocused();
  const caret = await textarea.evaluate((element) => (element as HTMLTextAreaElement).selectionStart);
  // javac's caret sits one past "3", column 18, which is the end of the line.
  expect(caret).toBe(code.indexOf("int x = 3") + "int x = 3".length);

  // Editing the line clears its mark.
  await page.keyboard.press("End");
  await page.keyboard.type(";");
  await expect(marker).toHaveCount(0);
});
