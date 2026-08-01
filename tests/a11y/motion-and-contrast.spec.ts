import { expect, test } from "@playwright/test";

import { auditPage } from "./helpers/audit";
import { openProblem, runningContestId } from "./helpers/journey";

/**
 * G9 — the two rules from DESIGN.md §7 that axe cannot check for us.
 *
 * 1. `prefers-reduced-motion` is respected by *every* animation. The global rule in
 *    `app/globals.css` collapses durations, and `useReducedMotion` collapses the Unfreeze's
 *    phase timings — but neither is worth anything unless it actually reaches the DOM, and the
 *    projector is a CSS-module surface that could easily have opted out by accident.
 * 2. Motion is theatre, never the message. Under reduced motion the board must still say
 *    whether it is live or frozen, in words, because that is the only channel left.
 */

test.describe("prefers-reduced-motion", () => {
  // This Playwright version carries the emulation flag on `contextOptions` rather than as a
  // top-level test option.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  /**
   * `/projector` serves the TEAM board by default (b5efe9e); its heading is `Team standings`.
   * Asserting the individual board's heading failed before the measurement below ever ran, so the
   * reduced-motion guarantee was going unchecked on the one surface that has a reveal animation.
   */
  test("no animation or transition on the projector outlives the preference", async ({ page }) => {
    await page.goto("/projector");
    await expect(page.getByRole("heading", { name: /team standings/i })).toBeVisible();

    const offenders = await page.evaluate(() => {
      const found: { selector: string; property: string; value: string }[] = [];

      const describe = (element: Element): string => {
        const id = element.id === "" ? "" : `#${element.id}`;
        const classes =
          typeof element.className === "string" && element.className !== ""
            ? `.${element.className.trim().split(/\s+/).join(".")}`
            : "";
        return `${element.tagName.toLowerCase()}${id}${classes}`;
      };

      /** "0.01ms" and "0s" are both fine; anything a human could perceive is not. */
      const perceptible = (value: string): boolean =>
        value
          .split(",")
          .map((part) => part.trim())
          .some((part) => {
            const seconds = part.endsWith("ms")
              ? Number.parseFloat(part) / 1000
              : Number.parseFloat(part);
            return Number.isFinite(seconds) && seconds > 0.05;
          });

      for (const element of Array.from(document.querySelectorAll("*"))) {
        const style = window.getComputedStyle(element);
        if (style.animationName !== "none" && perceptible(style.animationDuration)) {
          found.push({
            selector: describe(element),
            property: "animation-duration",
            value: style.animationDuration,
          });
        }
        if (style.transitionProperty !== "none" && perceptible(style.transitionDuration)) {
          found.push({
            selector: describe(element),
            property: "transition-duration",
            value: style.transitionDuration,
          });
        }
      }
      return found;
    });

    expect(
      offenders,
      `these elements still animate under prefers-reduced-motion:\n${offenders
        .map((o) => `  ${o.selector} { ${o.property}: ${o.value} }`)
        .join("\n")}`,
    ).toEqual([]);
  });

  /**
   * Pinned to a contest with `?contest=`, because the board only states live-or-frozen once it has
   * standings to state it about. Unpinned it renders its titled empty state — audited separately
   * in `team-screens.spec.ts` — and this assertion could never pass there.
   *
   * The id is read from the API's own un-scoped resolution rather than hardcoded, so this follows
   * whichever contest is running instead of pinning the test to a fixture id that changes on every
   * reseed.
   */
  test("the board still states live or frozen, in words", async ({ page }) => {
    await page.goto(`/projector?contest=${await runningContestId(page)}`);
    await expect(page.getByText(/^(Live|Board frozen)$/)).toBeVisible();
    await auditPage(page, "/projector (reduced motion)");
  });

  test("the competitor problem page is unaffected by losing its motion", async ({ page }) => {
    await openProblem(page);
    await expect(page.getByRole("button", { name: "Submit for judging" })).toBeEnabled();
    await auditPage(page, "/contest/[slug] (reduced motion)");
  });
});

test.describe("the projector is a paper surface, like everything else", () => {
  /*
    This used to assert the OPPOSITE — "the projector is the inverse surface", ink ground and paper
    text — and it was right about the code at the time.

    The projector is a Codeforces-style white board now. The reason it was dark was that `--gold`,
    `--rise` and `--fall` clear AAA on ink and fail AA on paper, so a dark stage was the only ground
    all three could appear on. That was true and it optimised for keeping three accent colours a
    standings board does not need; Codeforces uses one ground and one accent and reads from the back
    of a room.

    Kept as a spec rather than deleted, because the property still matters: the tokens must actually
    be EMITTED and APPLIED. A projector that silently falls back to a browser default is the failure
    this test exists to catch, and that failure looks identical on either ground.
  */
  test("paper ground, ink text — and the tokens are actually applied", async ({ page }) => {
    await page.goto("/projector");
    await expect(page.getByRole("heading", { name: /team standings/i })).toBeVisible();

    const surface = await page.evaluate(() => {
      const root = window.getComputedStyle(document.documentElement);
      const heading = document.querySelector("h1");
      if (heading === null) return null;

      // Walk up for the first ancestor that actually paints a background.
      let background = "rgba(0, 0, 0, 0)";
      let node: Element | null = heading;
      while (node !== null) {
        const value = window.getComputedStyle(node).backgroundColor;
        if (value !== "rgba(0, 0, 0, 0)" && value !== "transparent") {
          background = value;
          break;
        }
        node = node.parentElement;
      }

      return {
        ink: root.getPropertyValue("--color-ink").trim(),
        paper: root.getPropertyValue("--color-paper").trim(),
        headingColor: window.getComputedStyle(heading).color,
        background,
      };
    });

    expect(surface, "the projector heading should exist").not.toBeNull();
    expect(surface?.ink, "--color-ink must be emitted, not tree-shaken").toBe("#1a0606");
    expect(surface?.paper).toBe("#fbf9f8");

    // #1a0606 -> rgb(26, 6, 6); #fbf9f8 -> rgb(251, 249, 248).
    expect(surface?.background, "the projector stage should be paper").toBe("rgb(251, 249, 248)");
    expect(surface?.headingColor, "its text should be ink").toBe("rgb(26, 6, 6)");
  });

  test("competitor surfaces are the same way round", async ({ page }) => {
    await page.goto("/sign-in");
    const body = await page.evaluate(() => {
      const style = window.getComputedStyle(document.body);
      return { color: style.color, background: style.backgroundColor };
    });

    expect(body.background).toBe("rgb(251, 249, 248)");
    expect(body.color).toBe("rgb(26, 6, 6)");
  });
});
