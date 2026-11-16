import { expect, type Page } from "@playwright/test";

/**
 * Pick the editor's language by its visible label, on a fine pointer (the custom listbox) or a
 * phone (the native <select>), the same way a student does.
 *
 * The editor opens in Java 21 since 2026-11-16, so any spec that types Python or C++ has to choose
 * it first, exactly as a student writing Python would.
 */
export async function chooseLanguage(page: Page, label: string): Promise<void> {
  const picker = page.getByLabel("Language", { exact: true }).first();
  await expect(picker).toBeVisible();
  const native = await picker.evaluate((element) => element.tagName === "SELECT");
  if (native) {
    await picker.selectOption({ label });
  } else {
    await picker.click();
    await page.getByRole("option", { name: label, exact: true }).click();
  }
  await expect(picker).toContainText(label);
}
