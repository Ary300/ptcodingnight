import { expect, test, type Page } from "@playwright/test";

import { joinContest, placeInDivisionAndSet } from "./helpers/journey";

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

    // --- sign in ------------------------------------------------------------
    // There is no keyboard-navigable join form any more: a student signs in with Google or
    // GitHub, and neither consent screen is ours to drive. What remains OURS to guarantee is
    // everything after it — reading a problem, writing code and submitting, without a pointer —
    // so the session is minted and the walk starts where our keyboard surface starts.
    await joinContest(page);

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
   * The skip link has to precede everything else in tab order, be visible when focused rather
   * than permanently sr-only, and actually move the user to #main.
   *
   * Asserted on the lobby, which is where a signed-in student lands. An earlier version of this
   * test ran on `/join` and counted Tab presses, which was brittle for a reason worth keeping in
   * mind: that page autofocused its input, so focus began INSIDE main content — exactly where the
   * skip link would have sent it — and the test failed for a reason unrelated to the guarantee.
   * DOM position is the honest assertion.
   */
  test("the skip link precedes the page, shows focus, and works", async ({ page }) => {
    // Any competitor page carries the skip link; the lobby is the one every student lands on.
    await joinContest(page);

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
    //
    // On /sign-in the first Tab from the top of the document must reach a real control rather
    // than nothing — the page opens with the two provider buttons, which are the primary action.
    await page.goto("/sign-in");
    await page.keyboard.press("Tab");

    const next = await focused(page);
    expect(next.name, "the first Tab must land on something actionable").not.toBe("");
  });

  test("Ctrl+Enter in the editor submits, as the hint under it promises", async ({ page }) => {
    test.setTimeout(120_000);
    await joinContest(page);
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

    /*
      Retried, because the tablist is server-rendered and ArrowRight does nothing until React has
      attached its handler. The markup is present, focusable and correct before that, so every
      "wait for it" signal this test could use is already true while the press is still being
      dropped on the floor.

      The assertion is unchanged — ArrowRight must still move selection to the second tab. Only
      the pre-hydration window is tolerated, and this still fails if the key never works.
    */
    await expect(async () => {
      await tabs.first().focus();
      await page.keyboard.press("ArrowRight");
      await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    /*
      The focus ring is checked AFTER the keyboard moved focus, and that ordering is the point.

      The ring is `:focus-visible` (globals.css), which Chromium grants based on the last input
      modality — so a programmatic `.focus()` may or may not match depending on what the browser
      thinks happened last. Asserting it there was flaky in both directions and tested the wrong
      moment anyway: `:focus-visible` exists FOR keyboard users, so the state worth asserting is
      the one a keyboard user actually lands in.
    */
    const afterArrow = await focused(page);
    expect(afterArrow.role, "arrow keys should leave focus on a tab").toBe("tab");
    expect(afterArrow.outlineStyle, "a projector tab must show focus").not.toBe("none");
  });
});
