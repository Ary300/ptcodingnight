import { expect, test, type Locator, type Page } from "@playwright/test";

import { chooseLanguage } from "./helpers/language";
import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7, in a browser: IntelliJ's line, selection and statement keys reach the engine through the
 * real keydown path and edit the textarea natively. The engine suites cover the cases; this
 * covers the wiring, including the keys a Mac and a PC press differently.
 *
 * Runs as a practice guest on the arena's first warm-up (Python, Java and C++). Needs the arena
 * (`npx tsx scripts/seed-practice.ts`). No judge is involved.
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

async function openEditor(page: Page, language: string, text: string, caret: number): Promise<Locator> {
  await page.goto("/join");
  await page.getByRole("button", { name: "Practice" }).click();
  await page.waitForURL("**/contest");
  await page.goto(`/contest/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await chooseLanguage(page, language);
  const textarea = editor(page);
  await textarea.click();
  await textarea.fill(text);
  await textarea.evaluate((element, at) => (element as HTMLTextAreaElement).setSelectionRange(at, at), caret);
  return textarea;
}

async function isMac(page: Page): Promise<boolean> {
  return page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
}

async function selection(textarea: Locator): Promise<string> {
  return textarea.evaluate((element) => {
    const area = element as HTMLTextAreaElement;
    return area.value.slice(area.selectionStart, area.selectionEnd);
  });
}

async function caretOf(textarea: Locator): Promise<number> {
  return textarea.evaluate((element) => (element as HTMLTextAreaElement).selectionStart);
}

test.describe("Java keys", () => {
  test("Delete Line removes the caret's line and Complete Statement never submits", async ({ page }) => {
    const textarea = await openEditor(page, "Java 21", "int a = 1;\nint b = 2;\nint c = 3;", "int a = 1;\nint".length);
    const mac = await isMac(page);
    await page.keyboard.press(mac ? "Meta+Backspace" : "Control+y");
    await expect(textarea).toHaveValue("int a = 1;\nint c = 3;");

    await textarea.fill("        System.out.println(x");
    await page.keyboard.press("ControlOrMeta+Shift+Enter");
    // The statement is finished, so the caret goes on to a new line at the same indent.
    await expect(textarea).toHaveValue("        System.out.println(x);\n        ");
    // Still on the problem page with nothing judged: the chord is not the submit key.
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(textarea).toBeFocused();
  });

  test("Tab steps out of a closer and \"<\" pairs only after a type name", async ({ page }) => {
    const textarea = await openEditor(page, "Java 21", "", 0);
    await page.keyboard.type('System.out.println("hi');
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.type(";");
    await expect(textarea).toHaveValue('System.out.println("hi");');

    await textarea.fill("");
    await page.keyboard.type("List<Integer> xs; if (i < n) {");
    await expect(textarea).toHaveValue("List<Integer> xs; if (i < n) {}");
  });

  test("Tab steps out of a closer only while the caret has not left its pair", async ({ page }) => {
    const textarea = await openEditor(page, "Java 21", "", 0);
    // Nested: the inner closer first, then the outer, each typed by the editor.
    await page.keyboard.type("f(a[i");
    await expect(textarea).toHaveValue("f(a[i])");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.type(";");
    await expect(textarea).toHaveValue("f(a[i]);");

    // Out of the pair and back in: the closer is plain text now, and Tab indents.
    await textarea.fill("");
    await page.keyboard.type("g(");
    await expect(textarea).toHaveValue("g()");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Tab");
    await page.keyboard.type("x");
    await expect(textarea).toHaveValue(/^g\(\s+x\)$/);

    // A closer that was already in the code was never auto-inserted, so Tab does not leap it.
    await textarea.fill("h()");
    await textarea.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(2, 2));
    await page.keyboard.press("Tab");
    await page.keyboard.type("y");
    await expect(textarea).toHaveValue(/^h\(\s+y\)$/);
  });

  test("block comment, Join Lines and Toggle Case", async ({ page }) => {
    const textarea = await openEditor(page, "Java 21", "int x =\n        5;", 3);
    const mac = await isMac(page);
    await page.keyboard.press("Control+Shift+KeyJ");
    await expect(textarea).toHaveValue("int x = 5;");

    await textarea.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(4, 5));
    await page.keyboard.press(mac ? "Meta+Alt+Slash" : "Control+Shift+Slash");
    await expect(textarea).toHaveValue("int /*x*/ = 5;");

    await textarea.fill("int max;");
    await textarea.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(5, 5));
    await page.keyboard.press("ControlOrMeta+Shift+KeyU");
    await expect(textarea).toHaveValue("int MAX;");
  });

  test("Extend Selection grows by syntax and smart Home toggles", async ({ page }) => {
    const text = "    total += Math.max(ab, c);";
    const textarea = await openEditor(page, "Java 21", text, text.indexOf("ab") + 1);
    const mac = await isMac(page);
    const grow = mac ? "Alt+ArrowUp" : "Alt+Shift+ArrowRight";
    await page.keyboard.press(grow);
    expect(await selection(textarea)).toBe("ab");
    await page.keyboard.press(grow);
    expect(await selection(textarea)).toBe("ab, c");
    await page.keyboard.press(grow);
    expect(await selection(textarea)).toBe("(ab, c)");

    await textarea.evaluate((element, at) => (element as HTMLTextAreaElement).setSelectionRange(at, at), 10);
    const home = mac ? "Meta+ArrowLeft" : "Home";
    await page.keyboard.press(home);
    expect(await caretOf(textarea)).toBe(4);
    await page.keyboard.press(home);
    expect(await caretOf(textarea)).toBe(0);
  });
});

test.describe("Python keys", () => {
  test("Enter in an open call gives PyCharm's hanging indent", async ({ page }) => {
    const textarea = await openEditor(page, "Python 3", "", 0);
    await page.keyboard.type("total = max(");
    await page.keyboard.press("Delete");
    await page.keyboard.press("Enter");
    await expect(textarea).toHaveValue("total = max(\n    ");
  });

  test("main expands at the top level only", async ({ page }) => {
    const textarea = await openEditor(page, "Python 3", "def f():\n    main", "def f():\n    main".length);
    await page.keyboard.press("Tab");
    await expect(textarea).not.toHaveValue(/__main__/);
  });
});
