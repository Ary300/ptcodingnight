import { expect, test, type Page } from "@playwright/test";

import { chooseLanguage } from "../e2e/helpers/language";
import { pauseLiveContests, restoreContests, type PausedContest } from "../e2e/helpers/live-contests";
import { closeTestDb } from "../e2e/helpers/seed";
import { auditPage } from "./helpers/audit";

/**
 * G9: the editor with its on-screen marks drawn, and the Results drawer with a compile error whose
 * line references are buttons. Those buttons are new controls inside the compiler-output region,
 * so they have to be named, reachable and AA on the dark panel. The sample run is routed to a
 * fixed compile error, so no judge is needed.
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

async function openWithCompileError(page: Page): Promise<void> {
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
  await page.goto("/join");
  await page.getByRole("button", { name: "Practice" }).click();
  await page.waitForURL("**/contest");
  await page.goto(`/contest/${SLUG}`);
  await chooseLanguage(page, "Java 21");
  const textarea = page.getByRole("textbox", { name: /^Solution for / });
  await textarea.click();
  await textarea.fill("public class Main {\n    public static void main(String[] args) {\n        int x = 3\n    }\n}");
  await page.getByRole("button", { name: "Run examples" }).click();
  await expect(page.getByRole("button", { name: /^Main\.java:3, go to line 3$/ })).toBeVisible();
}

test.describe("axe-core: the editor's marks and the clickable compile error", () => {
  test("the problem page after a compile error", async ({ page }) => {
    await openWithCompileError(page);
    await auditPage(page, "/contest/[slug] (compile error, marks)");
  });

  test("the line reference is reachable by keyboard and returns focus to the editor", async ({ page }) => {
    await openWithCompileError(page);
    const reference = page.getByRole("button", { name: /^Main\.java:3, go to line 3$/ });
    await reference.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: /^Solution for / })).toBeFocused();
  });
});
