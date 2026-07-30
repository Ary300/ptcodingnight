import { expect, test, type Page } from "@playwright/test";

import { JOIN_CODE, nextDisplayName, placeInDivisionAndSet } from "./helpers/journey";

/**
 * G9 — the submit flow completes keyboard-only.
 *
 * No `click()` anywhere in the first spec: every step is a key. That is the point. A flow that
 * is reachable by mouse and "probably" by keyboard is one nobody has ever walked, and the
 * student who needs it finds out during the contest.
 *
 * The editor is the interesting part. Tab has to indent inside it (PRD §9.1) *and* must not
 * become a keyboard trap, so the surface documents Escape-then-Tab as the way out
 * (`CodeEditorSurface.tsx`). Both halves of that bargain are asserted below: Tab inserts an
 * indent, and Escape-then-Tab moves focus on to the buttons.
 */

const MAX_TABS = 40;

interface FocusSnapshot {
  readonly tag: string;
  readonly role: string | null;
  readonly name: string;
  readonly outlineStyle: string;
  readonly outlineWidth: string;
}

async function focused(page: Page): Promise<FocusSnapshot> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (element === null) {
      return { tag: "none", role: null, name: "", outlineStyle: "none", outlineWidth: "0px" };
    }
    const style = window.getComputedStyle(element);
    return {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role"),
      name:
        element.getAttribute("aria-label") ??
        element.textContent?.trim().slice(0, 80) ??
        "",
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
}

/** Tab forward until `matches` is true of the focused element. Fails loudly rather than hanging. */
async function tabUntil(
  page: Page,
  what: string,
  matches: (snapshot: FocusSnapshot) => boolean,
): Promise<FocusSnapshot> {
  const seen: string[] = [];
  for (let step = 0; step < MAX_TABS; step += 1) {
    const snapshot = await focused(page);
    if (matches(snapshot)) return snapshot;
    seen.push(`${snapshot.tag}${snapshot.role === null ? "" : `[${snapshot.role}]`}:${snapshot.name}`);
    await page.keyboard.press("Tab");
  }
  throw new Error(`could not reach ${what} with ${MAX_TABS} tabs. Focus went:\n  ${seen.join("\n  ")}`);
}

test.describe("keyboard-only", () => {
  test("a student joins, writes code, and submits without a pointer", async ({ page }) => {
    test.setTimeout(120_000);

    // --- join ---------------------------------------------------------------
    await page.goto("/join");
    await expect(page.getByRole("heading", { name: "Join the contest" })).toBeVisible();

    await tabUntil(page, "the join code field", (snapshot) => snapshot.tag === "input");
    await page.keyboard.type(JOIN_CODE);
    await page.keyboard.press("Enter");

    await expect(page.getByLabel("Display name")).toBeVisible();
    await tabUntil(page, "the display name field", (snapshot) => snapshot.tag === "input");
    await page.keyboard.type(nextDisplayName());
    await page.keyboard.press("Enter");

    await page.waitForURL("**/contest");
    // Setup, not interaction: the join form cannot send a division (an organizer assigns those),
    // and every fixture problem carries one, so the lobby is empty until the participant is
    // placed. Nothing below this line uses anything but the keyboard.
    await placeInDivisionAndSet(page);
    await expect(page.getByRole("heading", { name: "Problems", level: 1 })).toBeVisible();
    await expect(page.getByRole("listitem").getByRole("link").first()).toBeVisible();

    // --- pick a problem ------------------------------------------------------
    await page.evaluate(() => {
      // Start from the top of the document so the walk below is the one a student would make.
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await tabUntil(
      page,
      "a problem in the list",
      (snapshot) => snapshot.tag === "a" && / — .*points/.test(snapshot.name),
    );
    await page.keyboard.press("Enter");

    await page.waitForURL(/\/contest\/[^/]+$/);
    const editor = page.getByRole("textbox", { name: /^Solution for / });
    await expect(editor).toBeVisible();

    // --- write code ----------------------------------------------------------
    await tabUntil(page, "the editor", (snapshot) => snapshot.tag === "textarea");

    // `ControlOrMeta`, not `Control`. On macOS Ctrl+A is the emacs binding for "start of line",
    // so this selected nothing and typed INTO the starter template instead of replacing it. It
    // passed only because the stub backend served an empty editor; a real problem ships starter
    // code, which is the case a student actually meets.
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("import sys");
    await page.keyboard.press("Enter");
    await page.keyboard.type("a, b = sys.stdin.read().split()");
    await page.keyboard.press("Enter");
    await page.keyboard.type("print(int(a) + int(b))");

    const withCode = await editor.inputValue();
    expect(withCode).toContain("print(int(a) + int(b))");

    // Tab indents rather than moving focus...
    await page.keyboard.press("Tab");
    expect(
      (await focused(page)).tag,
      "Tab inside the editor must indent, not move focus (PRD §9.1)",
    ).toBe("textarea");
    expect(await editor.inputValue()).toContain("    ");

    // ...and Escape then Tab is the documented way out. Without this the editor is a trap.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    expect(
      (await focused(page)).tag,
      "Escape then Tab must move focus out of the editor",
    ).not.toBe("textarea");

    // --- submit --------------------------------------------------------------
    const submit = await tabUntil(page, "the Submit button", (snapshot) =>
      snapshot.name.startsWith("Submit for judging"),
    );
    expect(submit.outlineStyle, "focus must be visible, never outline:none").not.toBe("none");
    expect(submit.outlineWidth).not.toBe("0px");

    await page.keyboard.press("Enter");

    const verdict = page.getByRole("region", { name: "Verdict" });
    await expect(verdict).toBeVisible();
    await expect(
      verdict
        .locator("header")
        .getByText(/Accepted|Wrong answer|Too slow|Out of memory|Runtime error|Did not compile/),
    ).toBeVisible({ timeout: 60_000 });
  });

  /**
   * REVISED TEST. It originally asserted that one Tab from page load lands on the skip link.
   * That premise is wrong for this page: `/join` autofocuses the join-code input, which is
   * the single thing a student came here to fill in, so focus already starts *inside* main
   * content — precisely where the skip link would send them. Nothing is bypass-blocked, and
   * forward Tab correctly moves on to the submit button.
   *
   * What still has to be true, and is asserted below: the skip link precedes everything else
   * in tab order, it is visible when focused rather than permanently sr-only, and it actually
   * moves the user to #main.
   */
  test("the skip link precedes the page, shows focus, and works", async ({ page }) => {
    await page.goto("/join");

    // Asserted by DOM position rather than by counting Tab presses. Step-counting is brittle
    // — it depends on how many header links happen to exist and on where autofocus put the
    // caret — and it was the reason the first version of this test failed for the wrong
    // reason. What matters is that the skip link comes before every other focusable thing.
    const firstFocusableName = await page.evaluate(() => {
      const selector =
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
      const first = document.querySelector<HTMLElement>(selector);
      return first?.textContent?.trim() ?? null;
    });
    expect(firstFocusableName).toBe("Skip to main content");

    const link = page.getByRole("link", { name: "Skip to main content" });
    await link.focus();

    const focusedNow = await focused(page);
    expect(focusedNow.name).toBe("Skip to main content");
    expect(
      focusedNow.outlineStyle,
      "the skip link must show focus or it is invisible",
    ).not.toBe("none");

    await page.keyboard.press("Enter");
    expect(new URL(page.url()).hash).toBe("#main");
  });

  test("forward Tab from the autofocused field reaches the submit control", async ({ page }) => {
    // The other half of the same guarantee: autofocus must not strand the keyboard user.
    await page.goto("/join");
    await page.keyboard.press("Tab");

    const next = await focused(page);
    expect(next.name).toBe("Next");
  });

  test("Ctrl+Enter in the editor submits, as the hint under it promises", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/join");
    await page.getByLabel("Join code").fill(JOIN_CODE);
    await page.locator("form").getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Display name").fill(nextDisplayName());
    await page.getByRole("button", { name: "Join the contest" }).click();
    await page.waitForURL("**/contest");
    await placeInDivisionAndSet(page);

    await page.getByRole("listitem").getByRole("link").first().click();
    await page.waitForURL(/\/contest\/[^/]+$/);

    const editor = page.getByRole("textbox", { name: /^Solution for / });
    await editor.fill("import sys\nprint(sum(int(x) for x in sys.stdin.read().split()))");
    await editor.focus();
    await page.keyboard.press("Control+Enter");

    await expect(page.getByRole("region", { name: "Verdict" })).toBeVisible();
  });

  /**
   * `?mode=individual`, because division tabs are an individual-board concept.
   *
   * Teams replaced divisions as the ranking axis (PRD §6.1) and the team board has no tabs at all,
   * so this pointed at a screen that could never satisfy it. The individual board is still the
   * ICPC preset's only display, so the behaviour is still worth holding — it just lives at the
   * other URL now.
   */
  test("every division tab on the projector is reachable by arrow key", async ({ page }) => {
    await page.goto("/projector?mode=individual");
    const tabs = page.getByRole("tab");
    await expect(tabs.first()).toBeVisible();

    const count = await tabs.count();
    expect(count, "the projector should offer at least one division").toBeGreaterThan(0);
    if (count < 2) return;

    await tabs.first().focus();
    const firstFocus = await focused(page);
    expect(firstFocus.outlineStyle, "a projector tab must show focus").not.toBe("none");

    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  });
});
