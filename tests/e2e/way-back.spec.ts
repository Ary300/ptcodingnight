import { expect, test } from "@playwright/test";

/**
 * Every screen that is not the home page can be left without the browser's back button.
 *
 * Reported by an organizer using the site: "when I am at this page there is no way to go back to
 * the main page when there should be a back button." `/sign-in` was the case. It is a full-bleed
 * split screen outside the competitor route group, so it inherits no chrome, no nav and no footer,
 * and it is the destination of six one-way links: both header links on `/`, both hero buttons, the
 * closing band, the sign-out in `CompetitorChrome`, and every `?error=` redirect out of OAuth.
 *
 * ## Why this is a spec and not a screenshot
 *
 * The failure it guards against is invisible in review. Nothing about `/sign-in` LOOKED broken:
 * the form worked, G7 was green at 109/109, and the only symptom was a person on the page with
 * nowhere to go. This project has hit that shape repeatedly (see the memory note "screens must be
 * verified by using them" and the `/admin/teams` entry in `docs/TODO.md`), and the only thing that
 * catches it is asserting that the exit exists and that following it arrives somewhere.
 *
 * Both browser profiles, because the brand panel that carries the mark is `hidden lg:flex` — a
 * back link placed inside it would satisfy a desktop reviewer and be missing on every phone in the
 * room (PRD §11).
 */

test.describe("a way back from /sign-in", () => {
  test("offers a link home, and following it arrives at the home page", async ({ page }) => {
    await page.goto("/sign-in");

    const back = page.getByRole("main").getByRole("link", { name: "Back to the home page" });
    await expect(back).toBeVisible();

    await back.click();
    await page.waitForURL((url) => url.pathname === "/");

    // Landed on the real home page, not on a redirect that happens to have the right path.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("One board.");
  });

  test("the way back is the FIRST thing a keyboard reaches", async ({ page }) => {
    // Not merely present. A back link placed after the form is one the person who most needs it
    // has to tab through eleven controls to find, which is worse than a scroll on a phone.
    await page.goto("/sign-in");
    await page.keyboard.press("Tab");

    const name = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    expect(name).toBe("Back to the home page");
  });

  test("still offers it when OAuth bounced the student here with an error", async ({ page }) => {
    // The worst moment to be stranded: the student pressed a provider button, something refused,
    // and they are back on a page they never chose to open. The error banner takes focus on
    // arrival, so the link is no longer the first tab stop, but it must still be on the page.
    await page.goto("/sign-in?error=cancelled&provider=google");

    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Back to the home page" }),
    ).toBeVisible();
  });
});
