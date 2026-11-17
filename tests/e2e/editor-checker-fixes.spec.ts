import { expect, test, type Locator, type Page } from "@playwright/test";

import { chooseLanguage } from "./helpers/language";
import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7, in a browser: the failures three checkers found by typing real programs into the editor,
 * each pinned the way they found it. Real keys go in, and the textarea's value comes out.
 *
 * Runs as a practice guest. The two Run samples / Submit cases need a judge worker
 * (`npm run worker`); everything else needs only the arena (`npx tsx scripts/seed-practice.ts`).
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

async function open(page: Page, language: string, code = ""): Promise<Locator> {
  await page.goto("/join");
  await page.getByRole("button", { name: "Practice" }).click();
  await page.waitForURL("**/contest");
  await page.goto(`/contest/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await chooseLanguage(page, language);
  const textarea = editor(page);
  await textarea.click();
  await textarea.fill(code);
  await expect(textarea).toHaveValue(code);
  return textarea;
}

/** The text with the caret written "|" (or the selection «...»). */
async function marked(textarea: Locator): Promise<string> {
  return textarea.evaluate((element) => {
    const area = element as HTMLTextAreaElement;
    const { value, selectionStart: a, selectionEnd: b } = area;
    return a === b ? `${value.slice(0, a)}|${value.slice(a)}` : `${value.slice(0, a)}«${value.slice(a, b)}»${value.slice(b)}`;
  });
}

async function caretAt(page: Page, textarea: Locator, offset: number): Promise<void> {
  await textarea.evaluate((element, at) => (element as HTMLTextAreaElement).setSelectionRange(at, at), offset);
  await page.keyboard.press("Shift");
}

async function modifier(page: Page): Promise<"Meta" | "Control"> {
  const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
  return mac ? "Meta" : "Control";
}

test("brackets and quotes inside strings and comments type exactly as written, in all three languages", async ({ page }) => {
  const java = await open(page, "Java 21", "        ");
  await page.keyboard.type('System.out.println("(" + a + ")");');
  await expect(java).toHaveValue('        System.out.println("(" + a + ")");');
  await java.fill("        ");
  await page.keyboard.type('String s = "say \\"hi\\"";');
  await expect(java).toHaveValue('        String s = "say \\"hi\\"";');

  await chooseLanguage(page, "Python 3");
  const python = editor(page);
  await python.click();
  await python.fill("");
  await page.keyboard.type('# don\'t print the "debug" values');
  await page.keyboard.press("Enter");
  await page.keyboard.type('print("Case (" + str(i) + "):")');
  await expect(python).toHaveValue('# don\'t print the "debug" values\nprint("Case (" + str(i) + "):")');

  await chooseLanguage(page, "C++17");
  const cpp = editor(page);
  await cpp.click();
  await cpp.fill("    ");
  await page.keyboard.type("if (c == '(') x++;");
  await expect(cpp).toHaveValue("    if (c == '(') x++;");
});

test("Python else under an if inside a loop stays with its if", async ({ page }) => {
  const textarea = await open(page, "Python 3");
  await page.keyboard.type("for x in a:");
  await page.keyboard.press("Enter");
  await page.keyboard.type("if x:");
  await page.keyboard.press("Enter");
  await page.keyboard.type("b = 1");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("else:");
  await expect(textarea).toHaveValue("for x in a:\n    if x:\n        b = 1\n    else:");
});

test("undo puts the caret back after a smart edit, and a typed run undoes in one step", async ({ page }) => {
  const mod = await modifier(page);
  const code = "        int a = 1;\n        int b = 2;";
  const textarea = await open(page, "Java 21", code);
  await caretAt(page, textarea, "        int a".length);
  await page.keyboard.press(`${mod}+/`);
  await page.keyboard.press(`${mod}+z`);
  await expect(textarea).toHaveValue(code);
  expect(await marked(textarea)).toBe("        int a| = 1;\n        int b = 2;");
  await page.keyboard.type("x");
  await expect(textarea).toHaveValue("        int ax = 1;\n        int b = 2;");

  await textarea.fill("");
  await page.keyboard.type("hello world");
  await page.keyboard.press(`${mod}+z`);
  await expect(textarea).toHaveValue("");
});

test("a new variable's name keeps Enter a newline, and so does a name typed in full", async ({ page }) => {
  const textarea = await open(page, "Java 21", "        ");
  await page.keyboard.type("int n");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await expect(textarea).toHaveValue("        int n\n        ");
  await textarea.fill("        ");
  await page.keyboard.type("Scanner sc");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await expect(textarea).toHaveValue("        Scanner sc\n        ");

  await chooseLanguage(page, "Python 3");
  const python = editor(page);
  await python.click();
  await python.fill("import sys\n");
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("input = sys.stdin.readline");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await expect(python).toHaveValue("import sys\ninput = sys.stdin.readline\n");
});

test("copy and cut with no selection take the whole line, and its paste goes in above", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const mod = await modifier(page);
  const textarea = await open(page, "Java 21", "        int a = 1;\n        int b = 2;");
  await page.evaluate(() => navigator.clipboard.writeText("STALE"));
  await caretAt(page, textarea, "        int a".length);
  await page.keyboard.press(`${mod}+c`);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("        int a = 1;\n");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press(`${mod}+v`);
  await expect(textarea).toHaveValue("        int a = 1;\n        int a = 1;\n        int b = 2;");
  await page.keyboard.press(`${mod}+x`);
  await expect(textarea).toHaveValue("        int a = 1;\n        int a = 1;");
});

test("Esc, Esc, then Shift+Tab leaves backwards, and Esc, Esc, Tab leaves with the popup open", async ({ page }) => {
  const textarea = await open(page, "Java 21", "        x");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+Tab");
  await expect(textarea).not.toBeFocused();
  await expect(textarea).toHaveValue("        x");

  await textarea.click();
  await textarea.fill("        ");
  await page.keyboard.type("Sys");
  await expect(page.getByRole("listbox", { name: "Suggestions" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(textarea).not.toBeFocused();
  await expect(textarea).toHaveValue("        Sys");
});

test("Reformat Code re-indents by brace depth, on IntelliJ's key", async ({ page }) => {
  const mac = (await modifier(page)) === "Meta";
  const textarea = await open(page, "C++17", "int main() {\nint a;   \n        int b;\nswitch (a) {\ncase 1:\nb++;\nbreak;\n}\n}");
  await page.keyboard.press(mac ? "Meta+Alt+KeyL" : "Control+Alt+KeyL");
  await expect(textarea).toHaveValue(
    "int main() {\n    int a;\n    int b;\n    switch (a) {\n        case 1:\n            b++;\n            break;\n    }\n}",
  );
});

test("Tab in the popup replaces the rest of the word and keeps the call's parentheses", async ({ page }) => {
  const code = "        String s = sc.nextInt();";
  const textarea = await open(page, "Java 21", code);
  await caretAt(page, textarea, code.indexOf("Int()"));
  await page.keyboard.press("Control+Space");
  const popup = page.getByRole("listbox", { name: "Suggestions" });
  await expect(popup).toBeVisible();
  // Walk to nextLine with the arrows, as a student would.
  for (let i = 0; i < 12; i += 1) {
    if ((await popup.getByRole("option", { selected: true }).textContent())?.includes("nextLine") === true) break;
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Tab");
  expect(await marked(textarea)).toBe("        String s = sc.nextLine()|;");
});

test("Tab in a template field moves on even with the popup open", async ({ page }) => {
  const textarea = await open(page, "Python 3");
  await page.keyboard.type("fori");
  await page.keyboard.press("Tab");
  await page.keyboard.type("n");
  await expect(page.getByRole("listbox", { name: "Suggestions" })).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.type("pass");
  await expect(textarea).toHaveValue("for i in range(n):\n    pass");
});

test("default: snaps back to the case labels after a break", async ({ page }) => {
  const textarea = await open(page, "Java 21", "        ");
  await page.keyboard.type("switch (x) {");
  await page.keyboard.press("Enter");
  await page.keyboard.type("case 1:");
  await page.keyboard.press("Enter");
  await page.keyboard.type("y = 2;");
  await page.keyboard.press("Enter");
  await page.keyboard.type("break;");
  await page.keyboard.press("Enter");
  await page.keyboard.type("default:");
  await page.keyboard.press("Enter");
  await page.keyboard.type("y = 3;");
  await expect(textarea).toHaveValue(
    "        switch (x) {\n            case 1:\n                y = 2;\n                break;\n            default:\n                y = 3;\n        }",
  );
});

test("Replace: Tab goes from Find to Replace, and Replace all is one undo", async ({ page }) => {
  const mod = await modifier(page);
  const code = "        int total = 0;\n        total += 1;";
  const textarea = await open(page, "Java 21", code);
  await page.keyboard.press(`${mod}+r`);
  await page.keyboard.type("total");
  await page.keyboard.press("Tab");
  await page.keyboard.type("sum");
  await page.getByRole("button", { name: "Replace all" }).click();
  await expect(textarea).toHaveValue("        int sum = 0;\n        sum += 1;");
  await textarea.click();
  await page.keyboard.press(`${mod}+z`);
  await expect(textarea).toHaveValue(code);
});

test("only Mod+Enter submits: a Mac's Ctrl+Enter sends nothing", async ({ page }) => {
  test.skip((await modifier(page)) !== "Meta", "Ctrl is the submit modifier off a Mac");
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/submissions")) posts += 1;
  });
  const textarea = await open(page, "Java 21", "        int a = 1;");
  await page.keyboard.press("Control+Enter");
  await page.waitForTimeout(500);
  expect(posts).toBe(0);
  await expect(textarea).toHaveValue("        int a = 1;");
});

test("the editor keeps the focus after Mod+Enter submits", async ({ page }) => {
  test.setTimeout(120_000);
  const mod = await modifier(page);
  const textarea = await open(page, "Python 3", "print(1)");
  await page.keyboard.press(`${mod}+Enter`);
  await expect(page.getByRole("button", { name: "Submit for judging" })).toBeEnabled({ timeout: 60_000 });
  await expect(textarea).toBeFocused();
});

test("Parameter Info opens on its own after the '(' of a known call", async ({ page }) => {
  await open(page, "Java 21", "        int m = ");
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("Math.max(");
  await expect(page.getByRole("status").filter({ hasText: "max(" }).first()).toBeVisible();
});

test("Mod+Shift+Enter with the popup open accepts the row, then completes the statement", async ({ page }) => {
  const mod = await modifier(page);
  const textarea = await open(page, "Java 21", "        int total = 0;\n        ");
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("tot");
  await expect(page.getByRole("listbox", { name: "Suggestions" })).toBeVisible();
  await page.keyboard.press(`${mod}+Shift+Enter`);
  await expect(textarea).toHaveValue("        int total = 0;\n        total;\n        ");
});

test.describe("off a Mac", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "platform", { get: () => "Win32" });
    });
  });

  test("Alt+J three times picks three copies, and typing renames them all", async ({ page }) => {
    const code = "int main() {\n    int cnt = 0;\n    cnt++;\n    cnt--;\n}";
    const textarea = await open(page, "C++17", code);
    await caretAt(page, textarea, code.indexOf("cnt"));
    await page.keyboard.press("Alt+j");
    await page.keyboard.press("Alt+j");
    await page.keyboard.press("Alt+j");
    await page.keyboard.type("x");
    await expect(textarea).toHaveValue("int main() {\n    int x = 0;\n    x++;\n    x--;\n}");
  });
});

test("Run samples on Java that does not compile shows javac's output with a line link and a mark", async ({ page }) => {
  test.setTimeout(120_000);
  const code = [
    "import java.util.*;",
    "",
    "public class Main {",
    "    public static void main(String[] args) {",
    "        Scanner sc = new Scanner(System.in);",
    "        int n = sc.nextInt();",
    "        int x = 1",
    "        System.out.println(n + x);",
    "    }",
    "}",
  ].join("\n");
  const textarea = await open(page, "Java 21", code);
  await page.getByRole("button", { name: "Run samples" }).click();
  const link = page.getByRole("button", { name: /^Main\.java:7, go to line 7$/ });
  await expect(link).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Too small")).toHaveCount(0);
  await expect(page.locator("[data-diagnostic-line]")).toHaveAttribute("data-diagnostic-line", "7");
  await link.click();
  await expect(textarea).toBeFocused();
  const line = await textarea.evaluate((element) => {
    const area = element as HTMLTextAreaElement;
    return area.value.slice(0, area.selectionStart).split("\n").length;
  });
  expect(line).toBe(7);
});

test("a submission that does not compile shows the compiler's output live, without a reload", async ({ page }) => {
  test.setTimeout(150_000);
  const code = "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    int s = a + ;\n}\n";
  await open(page, "C++17", code);
  await page.getByRole("button", { name: "Submit for judging" }).click();
  await expect(page.getByRole("button", { name: /^main\.cpp:5(?::\d+)?, go to line 5$/ }).first()).toBeVisible({ timeout: 120_000 });
});
