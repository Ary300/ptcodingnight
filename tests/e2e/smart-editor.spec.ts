import { expect, test, type Locator, type Page } from "@playwright/test";

import { chooseLanguage } from "./helpers/language";
import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7, in a browser: the editor answers keystrokes the way IntelliJ, PyCharm and CLion do.
 *
 * Every step types REAL keys into the problem page and reads the textarea's value afterwards, so
 * what is pinned is the whole path a student's keystroke takes: the surface's keydown handler, the
 * pure engine, and the native insertText that keeps Ctrl/Cmd + Z working. The engine's own suites
 * cover the cases; this covers the wiring.
 *
 * Runs as a practice guest on the arena's first warm-up, which allows Python, Java and C++. Needs
 * the arena (`npx tsx scripts/seed-practice.ts`). No judge is involved.
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

function editor(page: Page): Locator {
  return page.getByRole("textbox", { name: new RegExp(`^Solution for ${title}`) });
}

/** The editor's polite live region, which says what Tab does now. */
function announcement(page: Page): Locator {
  return page.locator('[aria-live="polite"]', { hasText: /^Tab will / });
}

function popup(page: Page): Locator {
  return page.getByRole("listbox", { name: "Suggestions" });
}

/** Opens the problem in `language` with an empty editor that has focus. */
async function openEmptyEditor(page: Page, language: string): Promise<Locator> {
  await page.goto("/join");
  await page.getByRole("button", { name: "Practice" }).click();
  await page.waitForURL("**/contest");
  await page.goto(`/contest/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await chooseLanguage(page, language);
  const textarea = editor(page);
  await textarea.click();
  await textarea.fill("");
  await expect(textarea).toHaveValue("");
  return textarea;
}

/**
 * The modifier the PAGE treats as IntelliJ's: Cmd where the page sees a Mac, Ctrl elsewhere. Read
 * from the page rather than the host, because a device profile can report a different platform.
 */
async function intellijModifier(page: Page): Promise<"Meta" | "Control"> {
  const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
  return mac ? "Meta" : "Control";
}

async function caretOf(textarea: Locator): Promise<number> {
  return textarea.evaluate((element) => (element as HTMLTextAreaElement).selectionStart);
}

test.describe("Java, as IntelliJ does it", () => {
  test('"{" closes itself, Enter splits the pair onto three lines, and "}" snaps back', async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Java 21");

    await page.keyboard.type("class A {");
    await expect(textarea).toHaveValue("class A {}");
    expect(await caretOf(textarea)).toBe("class A {".length);

    await page.keyboard.press("Enter");
    await expect(textarea).toHaveValue("class A {\n    \n}");
    expect(await caretOf(textarea)).toBe("class A {\n    ".length);

    // A "}" typed on an over-indented line snaps to its block's indent.
    await textarea.fill("void f() {\n        ");
    await page.keyboard.type("}");
    await expect(textarea).toHaveValue("void f() {\n}");
  });

  test("a class typed in full and then '.' adds its import, and one undo takes both back", async ({
    page,
  }) => {
    // `Arrays.sort(a);` typed straight through used to add no import and fail to compile.
    const textarea = await openEmptyEditor(page, "Java 21");

    await page.keyboard.type("Arrays.");
    await expect(textarea).toHaveValue("import java.util.Arrays;\n\nArrays.");
    await page.keyboard.press("Escape");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(textarea).toHaveValue("Arrays");

    // A wildcard already covers it, so nothing is added. `fill` leaves the caret at the end.
    await textarea.fill("import java.util.*;\n\n");
    await page.keyboard.type("Arrays.");
    await expect(textarea).toHaveValue("import java.util.*;\n\nArrays.");
  });

  test("sout and psvm expand on Tab, and Ctrl/Cmd + Z takes an expansion back", async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Java 21");

    await page.keyboard.type("sout");
    await page.keyboard.press("Tab");
    await expect(textarea).toHaveValue("System.out.println();");
    expect(await caretOf(textarea)).toBe("System.out.println(".length);
    await expect(textarea).toBeFocused();

    // The expansion went through the browser's own undo stack, so one undo restores "sout".
    await page.keyboard.press("ControlOrMeta+z");
    await expect(textarea).toHaveValue("sout");

    await textarea.fill("");
    await page.keyboard.type("psvm");
    await page.keyboard.press("Tab");
    await expect(textarea).toHaveValue("public static void main(String[] args) {\n    \n}");
    expect(await caretOf(textarea)).toBe("public static void main(String[] args) {\n    ".length);
  });

  test('"System." opens the popup, and choosing from it builds System.out.println()', async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Java 21");

    await page.keyboard.type("System.");
    const list = popup(page);
    await expect(list).toBeVisible();
    await expect(list.getByRole("option", { name: "field out PrintStream" })).toBeVisible();
    // The textarea keeps focus and points at the list, which is how a screen reader follows it.
    await expect(textarea).toBeFocused();
    await expect(textarea).toHaveAttribute("aria-autocomplete", "list");
    await expect(textarea).toHaveAttribute("aria-controls", (await list.getAttribute("id")) ?? "");

    // Walk to "out" with the arrows; the active row is the one the textarea names.
    const out = list.getByRole("option", { name: "field out PrintStream" });
    for (let step = 0; step < 8 && (await out.getAttribute("aria-selected")) !== "true"; step += 1) {
      await page.keyboard.press("ArrowDown");
    }
    await expect(out).toHaveAttribute("aria-selected", "true");
    await expect(textarea).toHaveAttribute("aria-activedescendant", (await out.getAttribute("id")) ?? "");
    await page.keyboard.press("Enter");
    await expect(textarea).toHaveValue("System.out");
    await expect(list).toHaveCount(0);

    // "." pops the members of System.out on its own, as IntelliJ does.
    await page.keyboard.type(".");
    await expect(list.getByRole("option", { name: /^method println\(/ })).toBeVisible();
    await page.keyboard.type("printl");
    await expect(list.getByRole("option").first()).toHaveAccessibleName(/^method println\(/);
    await page.keyboard.press("Enter");
    await expect(textarea).toHaveValue("System.out.println()");
    // A method with parameters leaves the caret inside its parentheses.
    expect(await caretOf(textarea)).toBe("System.out.println(".length);
    await expect(list).toHaveCount(0);
  });

  test("Escape closes the popup without leaving the editor, and Enter is Enter again", async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Java 21");

    await page.keyboard.type("Sys");
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popup(page)).toHaveCount(0);
    await expect(textarea).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(textarea).toHaveValue("Sys\n");
  });

  test("the popup stays shut inside a string and a comment", async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Java 21");

    await page.keyboard.type('String s = "Sys');
    await page.keyboard.type("t");
    // The debounce is 40ms; four times that is long enough for a popup that was going to open.
    await page.waitForTimeout(200);
    await expect(popup(page)).toHaveCount(0);

    await textarea.fill("// Sys");
    await page.keyboard.type("t");
    await page.waitForTimeout(200);
    await expect(popup(page)).toHaveCount(0);
  });

  test("Ctrl/Cmd + / toggles a line comment and Ctrl/Cmd + D duplicates the line", async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Java 21");
    const mod = await intellijModifier(page);

    await textarea.fill("int x = 1;");
    await page.keyboard.press(`${mod}+/`);
    await expect(textarea).toHaveValue("//int x = 1;");
    await page.keyboard.press(`${mod}+/`);
    await expect(textarea).toHaveValue("int x = 1;");

    await page.keyboard.press(`${mod}+d`);
    await expect(textarea).toHaveValue("int x = 1;\nint x = 1;");
  });
});

test.describe("Java, the IntelliJ reflexes that used to misfire", () => {
  test("Ctrl/Cmd + Shift + Enter completes the statement and never submits", async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Java 21");
    const mod = await intellijModifier(page);
    const submissions: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/submissions")) submissions.push(request.url());
    });

    await textarea.fill("System.out.println(x)");
    await textarea.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(20, 20));
    await page.keyboard.press(`${mod}+Shift+Enter`);
    // The statement is finished, so the caret goes on to a new line.
    await expect(textarea).toHaveValue("System.out.println(x);\n");
    await page.keyboard.press("Control+Shift+Enter");
    await page.waitForTimeout(300);
    expect(submissions).toEqual([]);
    await expect(page.getByText("Judging your submission")).toHaveCount(0);
  });

  test("Enter after a declared name typed in full keeps the name and starts a new line", async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Java 21");
    await textarea.fill("int n = 5;\n");
    await textarea.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(11, 11));
    await page.keyboard.type("int x = n", { delay: 90 });
    // The name is already complete, so the list stays shut and cannot take the Enter.
    await page.waitForTimeout(300);
    await expect(popup(page)).toBeHidden();
    await page.keyboard.press("Enter");
    await expect(textarea).toHaveValue("int n = 5;\nint x = n\n");
  });

  test("fori: Tab visits the index, then the bound, and the next Tab lands inside the loop", async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Java 21");
    await page.keyboard.type("fori");
    await page.keyboard.press("Tab");
    // IntelliJ's order: the index first, then the bound.
    await page.keyboard.press("Tab");
    await page.keyboard.type("10");
    await page.keyboard.press("Tab");
    await expect(textarea).toHaveValue("for (int i = 0; i < 10; i++) {\n    \n}");
    expect(await caretOf(textarea)).toBe("for (int i = 0; i < 10; i++) {\n    ".length);
  });

  test("x.sout is a postfix template", async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Java 21");
    await page.keyboard.type("x.sout");
    await page.keyboard.press("Tab");
    await expect(textarea).toHaveValue("System.out.println(x);");
  });

  test("one Escape leaves Tab indenting; a second arms it to leave, and says so", async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Java 21");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await expect(textarea).toBeFocused();
    await expect(textarea).toHaveValue("    ");

    await expect(announcement(page)).toHaveText("Tab will insert an indent.");

    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    // "Says so" in words a screen reader gets in either layout: the live region announces the
    // change, and the textarea's description states the mode. Stacked, the description is the
    // visible sentence under the editor; side by side the sentence is gone (the shortcuts
    // popover replaced it), so it is only the description, and that is all this can require.
    await expect(announcement(page)).toHaveText("Tab will now move focus out of the editor.");
    await expect(textarea).toHaveAccessibleDescription(/^Tab now moves to the next control\./);
    await page.keyboard.press("Tab");
    await expect(textarea).not.toBeFocused();
  });

  test("Shift+Tab outdents a line indented with a tab", async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Java 21");
    await textarea.fill("\tx");
    await textarea.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(2, 2));
    await page.keyboard.press("Shift+Tab");
    await expect(textarea).toHaveValue("x");
  });

  test("the hint under the editor reads as plain sentences", async ({ page }) => {
    // The visible sentence is the STACKED page's; side by side, the shortcuts popover replaced
    // it. Desktop Chrome's 1280px window opens side by side, so choose stacked as a student would.
    await page.addInitScript(() => window.localStorage.setItem("ptcn.problem-layout.v1", "stacked"));
    await openEmptyEditor(page, "Java 21");
    const hint = page.locator("p", { hasText: "Tab indents." });
    const text = await hint.evaluate((element) => (element as HTMLElement).innerText);
    expect(text).toContain("Tab indents. Press Esc twice, then Tab, to move on. Ctrl / Cmd + Enter submits.");
  });

  test("Ctrl + Space opens completion on demand", async ({ page }) => {
    await openEmptyEditor(page, "Java 21");
    // Several suggestions (String, StringBuilder): an explicit call with exactly one inserts it.
    await page.keyboard.type("Str");
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popup(page)).toHaveCount(0);
    await page.keyboard.press("Control+Space");
    await expect(popup(page)).toBeVisible();
  });

  test("the key that ends an IME composition is the IME's (Safari's event order)", async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Java 21");
    await textarea.fill('String s = "";');
    await textarea.evaluate((element) => {
      const area = element as HTMLTextAreaElement;
      area.setSelectionRange(12, 12);
      area.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      area.setRangeText("日本", 12, 12, "end");
      area.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertCompositionText", data: "日本" }));
      area.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "日本" }));
      area.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, isComposing: false, bubbles: true, cancelable: true }),
      );
      area.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", keyCode: 229, isComposing: false, bubbles: true, cancelable: true }),
      );
    });
    await expect(textarea).toHaveValue('String s = "日本";');
  });

  test("a soft keyboard still pairs brackets and opens the popup", async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Java 21");
    await textarea.fill("f");
    await textarea.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(1, 1));
    const softKey = async () =>
      textarea.evaluate((element) =>
        element.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Unidentified", keyCode: 229, bubbles: true, cancelable: true }),
        ),
      );
    await softKey();
    await page.keyboard.insertText("(");
    await expect(textarea).toHaveValue("f()");
    await textarea.fill("int x = ");
    await textarea.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(8, 8));
    await softKey();
    await page.keyboard.insertText("Sy");
    await expect(popup(page)).toBeVisible();
  });

  test("the popup stays inside the window when the editor runs below the fold", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    const textarea = await openEmptyEditor(page, "Java 21");
    await textarea.fill(Array.from({ length: 60 }, (_, i) => `int v${i} = ${i};`).join("\n"));
    await textarea.evaluate((element) => {
      const area = element as HTMLTextAreaElement;
      area.scrollTop = 0;
      const lineHeight = parseFloat(getComputedStyle(area).lineHeight);
      const top = area.getBoundingClientRect().top + window.scrollY;
      // The editor's fifth line sits at the bottom edge of the window.
      window.scrollTo(0, top + 12 + lineHeight * 5 - window.innerHeight);
      const endOfLine4 = area.value.split("\n").slice(0, 4).join("\n").length;
      area.setSelectionRange(endOfLine4, endOfLine4);
    });
    await page.keyboard.press("Enter");
    await page.keyboard.type("S");
    const list = popup(page);
    await expect(list).toBeVisible();
    const bottom = await list.evaluate((element) => element.getBoundingClientRect().bottom);
    expect(bottom).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
  });

  test("the popup closes when the window is resized", async ({ page }) => {
    await openEmptyEditor(page, "Java 21");
    await page.keyboard.type("S");
    await expect(popup(page)).toBeVisible();
    const size = page.viewportSize() ?? { width: 1280, height: 720 };
    await page.setViewportSize({ width: size.width - 100, height: size.height - 100 });
    await expect(popup(page)).toHaveCount(0);
  });

  test("no serious axe violation with a long popup open", async ({ page }) => {
    await openEmptyEditor(page, "Java 21");
    await page.keyboard.type("S");
    await expect(popup(page).getByRole("option")).not.toHaveCount(0);
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    const results = await new AxeBuilder({ page }).include('[role="listbox"]').analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});

test.describe("Python, as PyCharm does it", () => {
  test('Enter after ":" indents one level', async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Python 3");

    await page.keyboard.type("if x:");
    await page.keyboard.press("Enter");
    await expect(textarea).toHaveValue("if x:\n    ");
    expect(await caretOf(textarea)).toBe("if x:\n    ".length);
  });

  test("Enter after a short variable at a normal typing pace is a newline, never a keyword", async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Python 3");
    // The editor indents the loop bodies itself, so the keys are typed with no leading spaces.
    await page.keyboard.type("def f(n):", { delay: 90 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("total = 0", { delay: 90 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("for i in range(n):", { delay: 90 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("total += i", { delay: 90 });
    // "i" is a complete name, so the list may stay shut; either way it must not take the Enter.
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await expect(textarea).toHaveValue("def f(n):\n    total = 0\n    for i in range(n):\n        total += i\n        ");

    // `return n` after a pause, the case that became `return not`.
    await textarea.fill("def f(n):\n    ");
    await textarea.evaluate((element) => {
      const area = element as HTMLTextAreaElement;
      area.setSelectionRange(area.value.length, area.value.length);
    });
    await page.keyboard.type("return n", { delay: 90 });
    await page.waitForTimeout(150);
    await page.keyboard.press("Enter");
    await expect(textarea).toHaveValue("def f(n):\n    return n\n");
  });

  test("else: snaps back to its if", async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Python 3");
    await page.keyboard.type("if n > 0:");
    await page.keyboard.press("Enter");
    await page.keyboard.type("print(n)");
    await page.keyboard.press("Enter");
    await page.keyboard.type("else:");
    await expect(textarea).toHaveValue("if n > 0:\n    print(n)\nelse:");
  });
});

test.describe("C++, as CLion does it", () => {
  test("main then Tab writes int main() with return 0", async ({ page }) => {
    const textarea = await openEmptyEditor(page, "C++17");

    await page.keyboard.type("main");
    await page.keyboard.press("Tab");
    await expect(textarea).toHaveValue("int main() {\n    \n    return 0;\n}");
    expect(await caretOf(textarea)).toBe("int main() {\n    ".length);
  });
});
