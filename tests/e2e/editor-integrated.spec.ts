import { expect, test, type Locator, type Page } from "@playwright/test";

import { chooseLanguage } from "./helpers/language";
import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7, in a browser: the places where the engine, completion, marks and commands meet. Accepting a
 * class adds its import in the same undo step, `new` completes a constructor, Alt+/ expands a word
 * from the file, F2 walks the last run's error lines, and Surround With leaves a live field.
 *
 * Runs as a practice guest on the arena's first warm-up, like smart-editor.spec.ts. The sample run
 * is routed to a fixed compile error, so no judge is needed.
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

function suggestions(page: Page): Locator {
  return page.getByRole("listbox", { name: "Suggestions" });
}

async function mod(page: Page): Promise<"Meta" | "Control"> {
  const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
  return mac ? "Meta" : "Control";
}

async function openEditor(page: Page, text: string, caret: number): Promise<Locator> {
  await page.goto("/join");
  await page.getByRole("button", { name: "Practice" }).click();
  await page.waitForURL("**/contest");
  await page.goto(`/contest/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await chooseLanguage(page, "Java 21");
  const textarea = editor(page);
  await textarea.click();
  await textarea.fill(text);
  await textarea.evaluate((element, at) => (element as HTMLTextAreaElement).setSelectionRange(at, at), caret);
  return textarea;
}

async function caretOf(textarea: Locator): Promise<number> {
  return textarea.evaluate((element) => (element as HTMLTextAreaElement).selectionStart);
}

test("accepting a class adds its import, and one undo takes both back", async ({ page }) => {
  const textarea = await openEditor(page, "", 0);
  await page.keyboard.type("ArrayLi", { delay: 40 });
  await expect(suggestions(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(textarea).toHaveValue("import java.util.ArrayList;\n\nArrayList");
  expect(await caretOf(textarea)).toBe("import java.util.ArrayList;\n\nArrayList".length);

  await page.keyboard.press(`${await mod(page)}+z`);
  await expect(textarea).toHaveValue("ArrayLi");
});

test("after new, a collection completes as a diamond constructor with the caret inside", async ({ page }) => {
  const start = "List<Integer> xs = ";
  const textarea = await openEditor(page, start, start.length);
  await page.keyboard.type("new ArrayL", { delay: 40 });
  await expect(suggestions(page)).toBeVisible();
  await page.keyboard.press("Enter");
  const expected = "import java.util.ArrayList;\n\nList<Integer> xs = new ArrayList<>()";
  await expect(textarea).toHaveValue(expected);
  expect(await caretOf(textarea)).toBe(expected.length - 1);
});

test("Alt+/ completes a word from the file, and pressing again cycles back to what was typed", async ({ page }) => {
  const text = "int counter = 0;\nint count = 1;\ncou";
  const textarea = await openEditor(page, text, text.length);
  await page.keyboard.press("Alt+Slash");
  await expect(textarea).toHaveValue("int counter = 0;\nint count = 1;\ncount");
  await page.keyboard.press("Alt+Slash");
  await expect(textarea).toHaveValue("int counter = 0;\nint count = 1;\ncounter");
  await page.keyboard.press("Alt+Slash");
  await expect(textarea).toHaveValue(text);
});

test("F2 moves the caret to the last run's error line and shows its message", async ({ page }) => {
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
  const textarea = await openEditor(page, code, 0);
  await page.getByRole("button", { name: "Run samples" }).click();
  await expect(page.locator("[data-diagnostic-line]")).toHaveAttribute("data-diagnostic-line", "3");

  await textarea.focus();
  await textarea.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(0, 0));
  await page.keyboard.press("F2");
  await expect(page.getByRole("status").filter({ hasText: "';' expected" })).toBeVisible();
  const lineThree = code.indexOf("int x = 3");
  const caret = await caretOf(textarea);
  expect(caret).toBeGreaterThanOrEqual(lineThree);
  expect(caret).toBeLessThanOrEqual(lineThree + "int x = 3".length);
  await expect(textarea).toBeFocused();
});

test("Surround With leaves the condition as a live field that Tab leaves", async ({ page }) => {
  const textarea = await openEditor(page, "a();", 4);
  await page.keyboard.press(`${await mod(page)}+Alt+t`);
  await expect(page.getByRole("menu", { name: "Surround with" })).toBeVisible();
  await page.keyboard.press("1");
  await page.keyboard.type("ok");
  await page.keyboard.press("Tab");
  await expect(textarea).toHaveValue("if (ok) {\n    a();\n}");
  // Tab took the template's next stop, the end of the wrapped body, and inserted no indent.
  expect(await caretOf(textarea)).toBe("if (ok) {\n    a();".length);
});
