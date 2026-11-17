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

test.describe("Python, as PyCharm does it", () => {
  test('Enter after ":" indents one level', async ({ page }) => {
    const textarea = await openEmptyEditor(page, "Python 3");

    await page.keyboard.type("if x:");
    await page.keyboard.press("Enter");
    await expect(textarea).toHaveValue("if x:\n    ");
    expect(await caretOf(textarea)).toBe("if x:\n    ".length);
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
