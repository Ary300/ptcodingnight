import { expect, test, type Locator, type Page } from "@playwright/test";

import { chooseLanguage } from "../e2e/helpers/language";
import { pauseLiveContests, restoreContests, type PausedContest } from "../e2e/helpers/live-contests";
import { closeTestDb } from "../e2e/helpers/seed";
import { auditPage } from "./helpers/audit";

/**
 * G9: the editor's command surfaces, each audited while it is open. The find bar with Replace,
 * Go to Line, the Surround With menu, an info panel, the picked-occurrence marks and the grouped
 * shortcuts popover all add controls or live regions to the problem page, and none of them exist
 * until a key opens them, so the page's own audit never sees them.
 */

const SLUG = "practice-two-sum";
let paused: PausedContest[] = [];

test.beforeAll(async () => {
  paused = await pauseLiveContests();
});

test.afterAll(async () => {
  await restoreContests(paused);
  await closeTestDb();
});

async function openEditor(page: Page, text: string): Promise<Locator> {
  await page.goto("/join");
  await page.getByRole("button", { name: "Practice" }).click();
  await page.waitForURL("**/contest");
  await page.goto(`/contest/${SLUG}`);
  await chooseLanguage(page, "Java 21");
  const textarea = page.getByRole("textbox", { name: /^Solution for / });
  await textarea.click();
  await textarea.fill(text);
  return textarea;
}

async function mod(page: Page): Promise<"Meta" | "Control"> {
  const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
  return mac ? "Meta" : "Control";
}

test.describe("axe-core: the editor's commands", () => {
  test("the find bar with Replace", async ({ page }) => {
    await openEditor(page, "int a = a + 1;");
    await page.keyboard.press(`${await mod(page)}+r`);
    await page.getByRole("textbox", { name: "Find", exact: true }).fill("a");
    await expect(page.getByRole("search", { name: "Find in code" }).getByRole("status")).toHaveText("1 of 2");
    await auditPage(page, "/contest/[slug] (find and replace)");
  });

  test("Go to Line", async ({ page }) => {
    await openEditor(page, "a\nb");
    const mac = (await mod(page)) === "Meta";
    await page.keyboard.press(mac ? "Meta+l" : "Control+g");
    await expect(page.getByRole("textbox", { name: /Line:Column/ })).toBeFocused();
    await auditPage(page, "/contest/[slug] (go to line)");
  });

  test("the Surround With menu", async ({ page }) => {
    await openEditor(page, "a();");
    await page.keyboard.press(`${await mod(page)}+Alt+t`);
    await expect(page.getByRole("menu", { name: "Surround with" })).toBeVisible();
    await auditPage(page, "/contest/[slug] (surround with)");
  });

  test("Quick Documentation, and picked occurrences", async ({ page }) => {
    const textarea = await openEditor(page, "ArrayList<Integer> list;");
    await textarea.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(3, 3));
    await page.keyboard.press("F1");
    await expect(page.getByRole("status").filter({ hasText: "java.util" })).toBeVisible();
    await auditPage(page, "/contest/[slug] (quick documentation)");
    await page.keyboard.press("Escape");
    const mac = (await mod(page)) === "Meta";
    await page.keyboard.press(mac ? "Meta+Control+g" : "Control+Alt+Shift+j");
    await auditPage(page, "/contest/[slug] (occurrences)");
  });

  test("the grouped shortcuts popover", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openEditor(page, "");
    const button = page.getByRole("button", { name: "Keyboard shortcuts" });
    test.skip((await button.count()) === 0, "the status bar shows only side by side");
    await button.click();
    await expect(page.getByRole("region", { name: "Keyboard shortcuts" })).toBeVisible();
    await auditPage(page, "/contest/[slug] (shortcuts popover)");
  });
});
