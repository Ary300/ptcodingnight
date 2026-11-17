import { expect, type Locator, type Page } from "@playwright/test";

/** The editor's language tab row, `role="tablist"` named "Language". */
export function languageTabs(page: Page): Locator {
  return page.getByRole("tablist", { name: "Language", exact: true }).first();
}

/**
 * Pick the editor's language by its visible label, "Python 3", "Java 21" or "C++17", by clicking
 * its tab the way a student does.
 *
 * The editor opens in Java 21 since 2026-11-16, so any spec that types Python or C++ has to choose
 * it first, exactly as a student writing Python would.
 */
export async function chooseLanguage(page: Page, label: string): Promise<void> {
  const tabs = languageTabs(page);
  // 30s, as the other specs allow for "Loading problem..." on a shared dev server: two pages
  // opened back to back measured past the default 5s with the tabs simply not rendered yet.
  await expect(tabs).toBeVisible({ timeout: 30_000 });
  const tab = tabs.getByRole("tab", { name: label, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}
