import { expect, test } from "@playwright/test";

/**
 * G9 — the shared primitives, asserted as a contract rather than as a look.
 *
 * ## Why a spec for tokens
 *
 * `app/globals.css` declares the tokens inside `@theme static` precisely because Tailwind 4
 * tree-shakes an ordinary `@theme` block, and a tree-shaken token does not fail to compile — it
 * resolves to nothing at runtime and the element silently falls back to a browser default. That
 * already happened once here (`--color-gold` and the projector keyframes), which is what the
 * `static` keyword and the comment above it are for.
 *
 * The radius, rule and spacing scales added in the de-AI pass are in exactly the same position:
 * every one of them is consumed as `var(--…)` from a Tailwind utility, so a rename or a
 * tree-shake shows up as "the corners went square" on somebody else's screen, three commits
 * later, with nothing in any log. Assert them where they are actually resolved — in a browser,
 * off `getComputedStyle` — not by reading the stylesheet back.
 *
 * ## And why the type scale is asserted as STEPS, not as values
 *
 * The measured failure this pass fixed was not a wrong font size. It was that 85% of the text on
 * a page rendered at one of two sizes, because `--text-lg` sat 25% over body — a step small
 * enough to read as a rounding error. So the assertion is on the RATIO between adjacent steps at
 * the top of the scale, which is the property that was missing. Re-tuning a value keeps this
 * green; flattening the scale back does not.
 */

const REM = 16;

test.describe("the token layer reaches the browser", () => {
  test("the type scale has a real step at the top", async ({ page }) => {
    await page.goto("/sign-in");

    const scale = await page.evaluate(() => {
      const root = window.getComputedStyle(document.documentElement);
      const read = (name: string): number =>
        Number.parseFloat(root.getPropertyValue(name).trim());
      return {
        xs: read("--text-xs"),
        sm: read("--text-sm"),
        md: read("--text-md"),
        lg: read("--text-lg"),
        xl: read("--text-xl"),
        xxl: read("--text-2xl"),
      };
    });

    // Emitted at all — a tree-shaken token parses as NaN here.
    for (const [step, value] of Object.entries(scale)) {
      expect(value, `--text-${step} must be emitted`).toBeGreaterThan(0);
    }

    // Monotonic, and body is 16px.
    expect(scale.sm * REM).toBeCloseTo(16, 1);
    expect(scale.md).toBeGreaterThan(scale.sm);
    expect(scale.lg).toBeGreaterThan(scale.md);
    expect(scale.xl).toBeGreaterThan(scale.lg);
    expect(scale.xxl).toBeGreaterThan(scale.xl);

    /*
     * The step that matters. A heading has to be a different KIND of thing from body text, not a
     * slightly larger instance of it. 1.4x is the floor: below it, `--text-lg` set next to
     * `--text-sm` reads as emphasis rather than as hierarchy, which is the state this scale was
     * re-cut to leave.
     */
    expect(scale.lg / scale.sm, "--text-lg must be at least 1.4x body").toBeGreaterThanOrEqual(1.4);
    expect(scale.xl / scale.lg, "--text-xl must be a real step over --text-lg").toBeGreaterThanOrEqual(1.3);
    expect(scale.xxl / scale.xl).toBeGreaterThanOrEqual(1.3);

    // The projector scale is separate on purpose and its floor is not negotiable (DESIGN.md §4).
    const projSm = await page.evaluate(() =>
      Number.parseFloat(
        window.getComputedStyle(document.documentElement).getPropertyValue("--text-proj-sm"),
      ),
    );
    expect(projSm * REM).toBeGreaterThanOrEqual(24);
  });

  test("radius, rule and spacing scales are emitted and distinct", async ({ page }) => {
    await page.goto("/sign-in");

    const tokens = await page.evaluate(() => {
      const root = window.getComputedStyle(document.documentElement);
      const read = (name: string): string => root.getPropertyValue(name).trim();
      return {
        radiusFlat: read("--radius-flat"),
        radiusChip: read("--radius-chip"),
        radiusPanel: read("--radius-panel"),
        ruleHair: read("--color-rule-hair"),
        ruleEdge: read("--color-rule-edge"),
        ruleFirm: read("--color-rule-firm"),
        spacingTight: read("--spacing-tight"),
        spacingGroup: read("--spacing-group"),
        spacingSection: read("--spacing-section"),
        railWidth: read("--rail-width"),
      };
    });

    for (const [name, value] of Object.entries(tokens)) {
      expect(value, `${name} must be emitted, not tree-shaken`).not.toBe("");
    }

    expect(Number.parseFloat(tokens.radiusFlat)).toBe(0);
    expect(Number.parseFloat(tokens.radiusPanel)).toBeGreaterThan(
      Number.parseFloat(tokens.radiusChip),
    );

    // Three rules that are actually three. Eleven near-identical alphas is what this replaced.
    expect(new Set([tokens.ruleHair, tokens.ruleEdge, tokens.ruleFirm]).size).toBe(3);

    /*
     * The 8x jump. `tight` to `section` is the interval that was missing entirely — at the old
     * spread, "inside a section" (16px) and "between sections" (24px) read as the same distance
     * and so nothing on any page grouped.
     */
    const tight = Number.parseFloat(tokens.spacingTight);
    const section = Number.parseFloat(tokens.spacingSection);
    expect(section / tight).toBeGreaterThanOrEqual(6);
  });
});

test.describe("a disabled control reads as off, not as broken", () => {
  /**
   * `/sign-in` holds its Sign in button disabled until an email and a password are typed, which
   * makes it the one place a disabled primary is on screen without any setup.
   *
   * The old `disabled:opacity-50` over a solid `--panther` fill painted a washed pink button:
   * still obviously a button, still obviously the primary one, and giving no signal that it was
   * off — so it read as enabled and somehow broken. DESIGN.md §7 exempts disabled controls from
   * the contrast floor (axe does not check them) but never exempted them from being legible.
   */
  test("the disabled primary carries no accent fill", async ({ page }) => {
    await page.goto("/sign-in");

    const button = page.getByRole("button", { name: "Sign in", exact: true }).first();
    await expect(button).toBeDisabled();

    const skin = await button.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        background: style.backgroundColor,
        color: style.color,
        opacity: style.opacity,
        cursor: style.cursor,
      };
    });

    // --panther is #c63527 -> rgb(198, 53, 39). A disabled control must not wear it.
    expect(skin.background).not.toContain("198, 53, 39");
    expect(skin.color).not.toContain("198, 53, 39");
    // And it must not be the live skin faded, which is what the wrapper opacity produced.
    expect(Number.parseFloat(skin.opacity)).toBe(1);
    expect(skin.cursor).toBe("not-allowed");
  });
});
