import { expect, test, type Locator, type Page } from "@playwright/test";

import { chooseLanguage } from "./helpers/language";
import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7, in a browser: the editor's IntelliJ commands. Find and Replace, Go to Line, Save, Surround
 * With, Parameter Info, Quick Documentation, Context Actions, picked occurrences, paste cleanup,
 * the font size, the remembered caret, the browser-chord guards and the leave-page guard.
 *
 * Runs as a practice guest on the arena's first warm-up, like smart-editor.spec.ts. No judge.
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

async function isMac(page: Page): Promise<boolean> {
  return page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
}

/** IntelliJ's modifier as the page sees it. */
async function mod(page: Page): Promise<"Meta" | "Control"> {
  return (await isMac(page)) ? "Meta" : "Control";
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

async function selection(textarea: Locator): Promise<[number, number]> {
  return textarea.evaluate((element) => {
    const area = element as HTMLTextAreaElement;
    return [area.selectionStart, area.selectionEnd] as [number, number];
  });
}

test("Find highlights every match, counts them, steps with Enter, and Escape returns to the code", async ({ page }) => {
  const textarea = await openEditor(page, "Java 21", "int a = 1;\nint b = a + a;", 0);
  const m = await mod(page);

  await page.keyboard.press(`${m}+f`);
  const bar = page.getByRole("search", { name: "Find in code" });
  await expect(bar).toBeVisible();
  const field = bar.getByRole("textbox", { name: "Find", exact: true });
  await expect(field).toBeFocused();
  await field.fill("a");
  await expect(bar.getByRole("status")).toHaveText("1 of 3");
  await expect(page.getByTestId("editor-match-layer").locator("mark")).toHaveCount(3);

  await page.keyboard.press("Enter");
  await expect(bar.getByRole("status")).toHaveText("2 of 3");
  await page.keyboard.press("Shift+Enter");
  await expect(bar.getByRole("status")).toHaveText("1 of 3");

  await bar.getByRole("button", { name: "Words" }).click();
  await expect(bar.getByRole("button", { name: "Words" })).toHaveAttribute("aria-pressed", "true");

  await field.focus();
  await page.keyboard.press("Escape");
  await expect(bar).toBeHidden();
  await expect(textarea).toBeFocused();
});

test("Replace all is one edit, and one undo takes it back", async ({ page }) => {
  const textarea = await openEditor(page, "Java 21", "int a = 1;\nint b = a + a;", 0);
  const m = await mod(page);

  await page.keyboard.press(`${m}+r`);
  const bar = page.getByRole("search", { name: "Find in code" });
  await bar.getByRole("textbox", { name: "Find", exact: true }).fill("a");
  await bar.getByRole("textbox", { name: "Replace with" }).fill("x");
  await bar.getByRole("button", { name: "Replace all" }).click();
  await expect(textarea).toHaveValue("int x = 1;\nint b = x + x;");

  await textarea.focus();
  await page.keyboard.press(`${m}+z`);
  await expect(textarea).toHaveValue("int a = 1;\nint b = a + a;");
});

test("Go to Line moves the caret to line:column", async ({ page }) => {
  const textarea = await openEditor(page, "Java 21", "a\nbb\nccc", 0);
  await page.keyboard.press((await isMac(page)) ? "Meta+l" : "Control+g");
  const field = page.getByRole("textbox", { name: /Line:Column/ });
  await expect(field).toBeFocused();
  await field.fill("3:2");
  await page.keyboard.press("Enter");
  await expect(textarea).toBeFocused();
  expect(await selection(textarea)).toEqual([6, 6]);
});

test("browser chords do nothing in the editor, and the editor's own still work", async ({ page }) => {
  const textarea = await openEditor(page, "Java 21", "int x = 1;", 10);
  const m = await mod(page);
  await page.evaluate(() => {
    const record: string[] = [];
    (window as unknown as { prevented: string[] }).prevented = record;
    window.addEventListener("keydown", (event) => {
      if (event.defaultPrevented) record.push(`${event.metaKey ? "M" : ""}${event.ctrlKey ? "C" : ""}${event.shiftKey ? "S" : ""}+${event.code}`);
    });
  });
  for (const chord of ["d", "BracketLeft", "y", "e", "o"]) await page.keyboard.press(`${m}+${chord}`);
  await page.keyboard.press("F5");
  await page.keyboard.press(`${m}+Shift+r`);
  await page.keyboard.press(`${m}+a`);
  const prevented = await page.evaluate(() => (window as unknown as { prevented: string[] }).prevented);
  const prefix = m === "Meta" ? "M" : "C";
  expect(prevented).toEqual(
    expect.arrayContaining([`${prefix}+KeyD`, `${prefix}+BracketLeft`, `${prefix}+KeyE`, `${prefix}+KeyO`, "+F5", `${prefix}S+KeyR`]),
  );
  // Select All is the browser's, and it still selects the code.
  expect(prevented).not.toContain(`${prefix}+KeyA`);
  await expect(page).toHaveURL(new RegExp(`/contest/${SLUG}$`));
  await expect(textarea).toBeFocused();
});

test("Save says Saved, and leaving asks only while the code is unsaved", async ({ page }) => {
  await openEditor(page, "Java 21", "", 0);
  const m = await mod(page);
  await page.keyboard.type("int unsaved = 1;");

  let asked = 0;
  page.on("dialog", (dialog) => {
    if (dialog.type() === "beforeunload") asked += 1;
    void dialog.dismiss();
  });
  await page.close({ runBeforeUnload: true }).catch(() => undefined);
  await expect.poll(() => asked).toBe(1);

  const fresh = await page.context().newPage();
  await openEditor(fresh, "Java 21", "", 0);
  await fresh.keyboard.type("int saved = 2;");
  await fresh.keyboard.press(`${m}+s`);
  await expect(fresh.getByTestId("editor-notice")).toHaveText("Saved");
  let askedAgain = 0;
  fresh.on("dialog", (dialog) => {
    askedAgain += 1;
    void dialog.accept();
  });
  await fresh.goto("/contest");
  expect(askedAgain).toBe(0);
});

test("Surround With wraps the line in an if and puts the caret in the condition", async ({ page }) => {
  const textarea = await openEditor(page, "Java 21", "a();", 4);
  const m = await mod(page);
  await page.keyboard.press(`${m}+Alt+t`);
  const menu = page.getByRole("menu", { name: "Surround with" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("1");
  await expect(textarea).toHaveValue("if () {\n    a();\n}");
  await expect(textarea).toBeFocused();
  expect(await selection(textarea)).toEqual([4, 4]);
  // IntelliJ's empty condition is a template field: typing fills it, Tab moves on into the body.
  await page.keyboard.type("x > 0");
  await expect(textarea).toHaveValue("if (x > 0) {\n    a();\n}");
});

test("Insert Live Template lists this language's templates on Mod+J, and Enter inserts one with its fields", async ({ page }) => {
  const code = "class Main {\n    void f() {\n        so\n    }\n}";
  const textarea = await openEditor(page, "Java 21", code, code.indexOf("so") + 2);
  await page.keyboard.press(`${await mod(page)}+j`);
  const menu = page.getByRole("menu", { name: "Insert live template" });
  await expect(menu).toBeVisible();
  // Narrowed to what was typed, each row with IntelliJ's description.
  await expect(menu.getByRole("menuitem").first()).toContainText("sout");
  await expect(menu.getByRole("menuitem").first()).toContainText("Prints a string to System.out");
  for (const name of await menu.getByRole("menuitem").allInnerTexts()) expect(name).toMatch(/so/);
  // Quick Documentation is no longer on this chord: nothing but the menu opened.
  await expect(page.getByRole("status").filter({ hasText: "No documentation" })).toHaveCount(0);

  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(textarea).toBeFocused();
  await expect(textarea).toHaveValue("class Main {\n    void f() {\n        System.out.println();\n    }\n}");
  await page.keyboard.type("1");
  await expect(textarea).toHaveValue("class Main {\n    void f() {\n        System.out.println(1);\n    }\n}");

  // A template with fields keeps them: fori selects its variable, Tab moves to the bound.
  await textarea.fill("class Main {\n    void f() {\n        \n    }\n}");
  await textarea.evaluate((element) => {
    const area = element as HTMLTextAreaElement;
    const at = area.value.indexOf("        \n") + 8;
    area.setSelectionRange(at, at);
  });
  await page.keyboard.press(`${await mod(page)}+j`);
  await menu.getByRole("menuitem", { name: /fori/ }).first().click();
  await expect(textarea).toHaveValue(/for \(int i = 0; i < ; i\+\+\) \{/);
  await page.keyboard.press("Tab");
  await page.keyboard.type("n");
  await expect(textarea).toHaveValue(/for \(int i = 0; i < n; i\+\+\) \{/);
});

/** The viewport point over text cell (row, column), 0-based, from the textarea's own metrics. */
async function cellPoint(textarea: Locator, row: number, column: number): Promise<{ x: number; y: number }> {
  return textarea.evaluate(
    (element, [r, c]) => {
      const area = element as HTMLTextAreaElement;
      const style = getComputedStyle(area);
      const rect = area.getBoundingClientRect();
      const probe = document.createElement("span");
      probe.textContent = "0".repeat(20);
      probe.style.font = style.font;
      probe.style.position = "absolute";
      probe.style.whiteSpace = "pre";
      document.body.appendChild(probe);
      const charWidth = probe.getBoundingClientRect().width / 20;
      probe.remove();
      const lineHeight = Number.parseFloat(style.lineHeight);
      return {
        x: rect.left + area.clientLeft + Number.parseFloat(style.paddingLeft) + (c ?? 0) * charWidth - area.scrollLeft + 1,
        y: rect.top + area.clientTop + Number.parseFloat(style.paddingTop) + (r ?? 0) * lineHeight + lineHeight / 2 - area.scrollTop,
      };
    },
    [row, column],
  );
}

test("Alt+click adds carets: typing, Backspace, Delete and Enter apply at each as one undo step", async ({ page }) => {
  const textarea = await openEditor(page, "Java 21", "int a;\nint b;\nint c;", 4);
  for (const row of [1, 2]) {
    const point = await cellPoint(textarea, row, 4);
    await page.keyboard.down("Alt");
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up("Alt");
  }
  await expect(page.getByTestId("editor-extra-caret")).toHaveCount(2);

  await page.keyboard.type("xy");
  await expect(textarea).toHaveValue("int xya;\nint xyb;\nint xyc;");
  await page.keyboard.press("Backspace");
  await expect(textarea).toHaveValue("int xa;\nint xb;\nint xc;");
  await page.keyboard.press("Delete");
  await expect(textarea).toHaveValue("int x;\nint x;\nint x;");
  await page.keyboard.press("Enter");
  await expect(textarea).toHaveValue("int x\n;\nint x\n;\nint x\n;");

  // One undo takes the last key back at every caret at once, and a chord returns to one caret.
  await page.keyboard.press(`${await mod(page)}+z`);
  await expect(textarea).toHaveValue("int x;\nint x;\nint x;");
  await expect(page.getByTestId("editor-extra-caret")).toHaveCount(0);
});

test("Clone Caret Below adds a caret on the next line; Escape leaves one", async ({ page }) => {
  const textarea = await openEditor(page, "Java 21", "int a;\nint b;", 4);
  await page.keyboard.press("Control+Shift+Alt+ArrowDown");
  await expect(page.getByTestId("editor-extra-caret")).toHaveCount(1);
  await page.keyboard.type("_");
  await expect(textarea).toHaveValue("int _a;\nint _b;");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("editor-extra-caret")).toHaveCount(0);
  await page.keyboard.type("q");
  await expect(textarea).toHaveValue("int _a;\nint _qb;");
});

test("Alt+Shift+drag selects a column, and typing replaces it on every line", async ({ page }) => {
  const textarea = await openEditor(page, "Java 21", "int a;\nint b;\nint c;", 0);
  const from = await cellPoint(textarea, 0, 0);
  const to = await cellPoint(textarea, 2, 3);
  await page.keyboard.down("Alt");
  await page.keyboard.down("Shift");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.up("Alt");
  await page.keyboard.type("var");
  await expect(textarea).toHaveValue("var a;\nvar b;\nvar c;");
});

test("Context actions add the missing import, and Parameter Info and Quick Documentation show", async ({ page }) => {
  const textarea = await openEditor(page, "Java 21", "ArrayList<Integer> a;", 3);
  await page.keyboard.press("Alt+Enter");
  const menu = page.getByRole("menu", { name: "Context actions" });
  await expect(menu.getByRole("menuitem", { name: /import java\.util\.ArrayList/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(textarea).toHaveValue("import java.util.ArrayList;\n\nArrayList<Integer> a;");

  await page.keyboard.press("F1");
  await expect(page.getByRole("status").filter({ hasText: "java.util" })).toBeVisible();
  await page.keyboard.press("Escape");

  await textarea.fill("int m = Math.max(1, ");
  await page.keyboard.press(`${await mod(page)}+p`);
  await expect(page.getByRole("status").filter({ hasText: "max(" }).first()).toBeVisible();
});

test("Select All Occurrences, then typing renames every copy as one undo step", async ({ page }) => {
  const textarea = await openEditor(page, "Java 21", "int n = n + n;", 4);
  const mac = await isMac(page);
  await page.keyboard.press(mac ? "Meta+Control+g" : "Control+Alt+Shift+j");
  await expect(page.getByTestId("editor-match-layer").locator("mark")).toHaveCount(3);
  await page.keyboard.type("k");
  await expect(textarea).toHaveValue("int k = k + k;");
  await page.keyboard.type("2");
  await expect(textarea).toHaveValue("int k2 = k2 + k2;");
  await page.keyboard.press("Escape");
  await page.keyboard.type("x");
  await expect(textarea).toHaveValue("int k2x = k2 + k2;");
});

test("Select Next Occurrence picks the next copy", async ({ page }) => {
  const textarea = await openEditor(page, "Java 21", "int n = n + 1;", 4);
  const next = (await isMac(page)) ? "Control+g" : "Alt+j";
  await page.keyboard.press(next);
  expect(await selection(textarea)).toEqual([4, 5]);
  await page.keyboard.press(next);
  expect(await selection(textarea)).toEqual([8, 9]);
  await page.keyboard.type("m");
  await expect(textarea).toHaveValue("int m = m + 1;");
});

test("a pasted block is re-indented to the caret's line", async ({ page }) => {
  const textarea = await openEditor(page, "Python 3", "def f():\n    ", 13);
  await textarea.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", "if x:\n\ty = 1");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(textarea).toHaveValue("def f():\n    if x:\n        y = 1");
});

test("Alt+Space opens completion where Ctrl+Space switches keyboards", async ({ page }) => {
  await openEditor(page, "Java 21", "", 0);
  // Several suggestions (String, StringBuilder): an explicit call with exactly one inserts it.
  await page.keyboard.type("Str");
  const list = page.getByRole("listbox", { name: "Suggestions" });
  await expect(list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await page.keyboard.press("Alt+Space");
  await expect(list).toBeVisible();
});

test("the font size changes only the editor, within bounds, and the caret comes back after a reload", async ({ page }) => {
  const textarea = await openEditor(page, "Java 21", "int a = 1;\nint b = 2;\n", 13);
  const m = await mod(page);
  const size = () => textarea.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  const before = await size();
  await page.keyboard.press(`${m}+Equal`);
  await expect.poll(size).toBe(before + 1);
  for (let index = 0; index < 20; index += 1) await page.keyboard.press(`${m}+Minus`);
  await expect.poll(size).toBe(12);
  await page.keyboard.press(`${m}+Equal`);
  await page.keyboard.press(`${m}+Equal`);
  await expect.poll(size).toBe(14);

  await textarea.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(13, 13));
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  await page.reload();
  await expect.poll(() => selection(editor(page))).toEqual([14, 14]);
  await expect.poll(() => editor(page).evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBe(14);
});

test("Ctrl/Cmd + ' runs the samples and never submits", async ({ page }) => {
  await openEditor(page, "Java 21", "public class Main { public static void main(String[] a) {} }", 0);
  let submitted = false;
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/submissions?(\?|$)/.test(new URL(request.url()).pathname)) submitted = true;
  });
  const ran = page.waitForRequest((request) => request.method() === "POST" && /sample|run/i.test(request.url()));
  await page.keyboard.press(`${await mod(page)}+Quote`);
  await ran;
  expect(submitted).toBe(false);
});

test("writing assistants and translation are kept out of the code", async ({ page }) => {
  const textarea = await openEditor(page, "Java 21", "", 0);
  await expect(textarea).toHaveAttribute("data-gramm", "false");
  await expect(textarea).toHaveAttribute("data-gramm_editor", "false");
  await expect(textarea).toHaveAttribute("data-enable-grammarly", "false");
  await expect(textarea).toHaveAttribute("translate", "no");
  await expect(textarea).toHaveAttribute("spellcheck", "false");
});

test("closing the find bar with Escape keeps Esc, Esc, Tab as the way out", async ({ page }) => {
  const textarea = await openEditor(page, "Java 21", "int a;", 0);
  await page.keyboard.press(`${await mod(page)}+f`);
  await page.keyboard.press("Escape");
  await expect(textarea).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(textarea).not.toBeFocused();
});
