import { expect, test, type Page } from "@playwright/test";

import { auditPage } from "./helpers/audit";
import { joinContest, signInAsOrganizer } from "./helpers/journey";

/**
 * G9 — axe on every team-mode surface.
 *
 * These screens were added after the original a11y pass and had **no axe coverage at all**. The
 * projector team board is the one the room stares at for an hour from ten metres away, which makes
 * it the single most consequential surface in the application to get contrast wrong on.
 *
 * Same bar as everywhere else: **zero critical or serious**. Plus the two DESIGN.md §7 rules axe
 * cannot check on its own, asserted directly against the computed styles:
 *
 *   `text-ink/N` on `--paper` — floor **57%**, so `/60`. `/55` measures 4.34:1 and fails AA.
 *   `text-paper/N` on `--ink` — floor **47%**, so `/55`. `/45` measures 4.29:1.
 *   Never dim a container with `opacity-*` to mute the text inside it — wrapper opacity
 *   MULTIPLIES with child alpha, and `opacity-60` over `text-ink/70` composites to 2.84:1.
 *
 * axe catches the composite result when it can compute a background. It cannot when the element is
 * layered over a gradient or an image, and it does not flag a wrapper opacity as the cause — so the
 * structural rule is checked separately.
 */

/** Alpha below which muted text on `--paper` fails AA at body size. DESIGN.md §7. */
const INK_ON_PAPER_FLOOR = 0.57;

/**
 * Every element whose text is muted by a wrapper's `opacity`, rather than by its own colour alpha.
 *
 * Returns offenders rather than a boolean so a failure names the element to fix.
 */
async function wrapperOpacityOffenders(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = [];

    const describe = (element: Element): string => {
      const id = element.id === "" ? "" : `#${element.id}`;
      const cls =
        typeof element.className === "string" && element.className.trim() !== ""
          ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}`
          : "";
      return `${element.tagName.toLowerCase()}${id}${cls}`;
    };

    for (const element of Array.from(document.querySelectorAll("body *"))) {
      const style = window.getComputedStyle(element);
      const opacity = Number.parseFloat(style.opacity);

      // 1 is untouched; 0 is hidden and axe ignores it anyway. Anything between is a partial dim.
      if (!Number.isFinite(opacity) || opacity >= 1 || opacity === 0) continue;

      // A disabled control is exempt: axe does not check contrast on disabled elements, and a
      // dimmed disabled button is the conventional way to show it (DESIGN.md §7).
      if (element.matches(":disabled") || element.querySelector(":disabled") !== null) continue;

      // Only complain when the dimmed element CONTAINS text. Dimming an icon or a rule is fine.
      const text = (element.textContent ?? "").trim();
      if (text === "") continue;

      offenders.push(`${describe(element)} — opacity ${style.opacity} over text "${text.slice(0, 40)}"`);
    }

    return offenders;
  });
}

/**
 * Muted text whose own colour alpha is below the floor.
 *
 * Reads the computed `color` rather than the class name, so a token change that quietly lowers the
 * alpha is caught even though the markup still says `/60`.
 */
async function alphaFloorOffenders(page: Page, floor: number): Promise<string[]> {
  return page.evaluate((minimum) => {
    const offenders: string[] = [];

    // Elements that hold text but render none. `<title>` and `<style>` both have text nodes and a
    // computed colour, and an earlier version of this check reported them as contrast failures.
    const NOT_RENDERED = new Set(["TITLE", "STYLE", "SCRIPT", "HEAD", "META", "LINK", "NOSCRIPT"]);

    for (const element of Array.from(document.querySelectorAll("body *"))) {
      if (NOT_RENDERED.has(element.tagName)) continue;

      const text = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => (node.textContent ?? "").trim())
        .join("");
      if (text === "") continue;

      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;

      // FOUR components only. `rgb(0, 0, 0)` has no alpha at all, and a lazier regex reads its
      // blue channel as one — which reported pure black as a contrast failure.
      const match = /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/.exec(
        style.color,
      );
      if (match === null) continue;

      const alpha = Number.parseFloat(match[1] ?? "1");
      if (Number.isFinite(alpha) && alpha < minimum) {
        offenders.push(
          `${element.tagName.toLowerCase()} — color ${style.color} on "${text.slice(0, 40)}"`,
        );
      }
    }

    return offenders;
  }, floor);
}

test.describe("axe-core: team-mode screens", () => {
  test("projector team board", async ({ page }) => {
    // The default board. Read from the back of a classroom for an hour, so contrast matters here
    // more than anywhere else in the application.
    await page.goto("/projector");
    await expect(page.getByRole("heading", { name: /team standings/i })).toBeVisible();

    await auditPage(page, "/projector (team board)");
  });

  test("projector team board keeps its heading when it has no data", async ({ page }) => {
    // The empty state is a real state on the wall — before a contest is pinned, or if the API is
    // unreachable — and it must still be a titled, audited page rather than a bare sentence.
    await page.goto("/projector?contest=no-such-contest");
    await expect(page.getByRole("heading", { name: /team standings/i })).toBeVisible();
    await expect(page.getByRole("status")).toBeVisible();

    await auditPage(page, "/projector (team board, no data)");
  });

  test("projector individual board still passes", async ({ page }) => {
    // ?mode=individual is the ICPC preset's only display. It was audited before teams existed and
    // must not rot now that it is off the default path.
    await page.goto("/projector?mode=individual");
    await expect(page.getByRole("heading", { name: "Park Tudor Coding Night" })).toBeVisible();

    await auditPage(page, "/projector?mode=individual");
  });

  test("my team", async ({ page }) => {
    await joinContest(page);
    await page.goto("/team");

    // Either the board or an honest reason there is none — both are audited, because a student who
    // is not on a team sees the second one and it carries a `role="alert"`.
    await expect(page.getByRole("heading").first()).toBeVisible();
    await auditPage(page, "/team");
  });

  test("my team, with a row expanded", async ({ page }) => {
    await joinContest(page);
    await page.goto("/team");

    // Wait for the BOARD, not just the heading. The heading now renders in every state, so
    // checking it would race the fetch and this test would skip itself — which is the worst
    // outcome here, since the breakdown is all muted secondary text and is where a contrast
    // mistake is most likely to hide.
    await expect(page.getByRole("table", { name: /team standings/i })).toBeVisible();

    const expander = page.getByRole("button", { name: /players$/ }).first();
    await expect(expander).toBeVisible();
    await expander.click();

    // The breakdown is a different DOM: a definition list of the arithmetic.
    await expect(page.getByText(/Player pool/)).toBeVisible();
    await auditPage(page, "/team (breakdown expanded)");
  });

  test("admin side-activity entry", async ({ page }) => {
    await signInAsOrganizer(page);
    // Every control here is a labelled form field, which is exactly the shape axe is best at
    // catching mistakes in — and an unlabelled points field on the one screen that awards
    // unverifiable points is a bad place to have one.
    await page.goto("/admin/side-activities?contest=demo");
    await expect(page.getByRole("heading", { name: /side activities/i })).toBeVisible();

    await auditPage(page, "/admin/side-activities");
  });

  test("admin side-activity entry with no contest pinned", async ({ page }) => {
    await signInAsOrganizer(page);
    await page.goto("/admin/side-activities");
    await expect(page.getByRole("heading", { name: /side activities/i })).toBeVisible();

    // The contest PICKER is what renders here now, and it is a list of links an organizer has to
    // be able to operate. It replaced a paragraph telling them to edit the URL by hand.
    await expect(page.getByRole("region", { name: /choose a contest/i })).toBeVisible();

    await auditPage(page, "/admin/side-activities (no contest)");
  });
});

test.describe("DESIGN.md §7 contrast floors, which axe cannot check alone", () => {
  const SURFACES = [
    { path: "/projector", label: "projector team board" },
    { path: "/projector?contest=no-such-contest", label: "projector team board, empty" },
    { path: "/admin/side-activities?contest=demo", label: "admin side activities" },
  ] as const;

  for (const surface of SURFACES) {
    test(`${surface.label} never dims text with a wrapper opacity`, async ({ page }) => {
      await page.goto(surface.path);
      await page.waitForLoadState("networkidle");

      const offenders = await wrapperOpacityOffenders(page);

      expect(
        offenders,
        `${surface.label}: wrapper opacity MULTIPLIES with child alpha, so these composite far below\n` +
          `what the class name suggests — opacity-60 over text-ink/70 lands at 2.84:1.\n` +
          `Mute the text's own colour instead:\n  ${offenders.join("\n  ")}`,
      ).toEqual([]);
    });

    test(`${surface.label} keeps muted text at or above the measured floor`, async ({ page }) => {
      await page.goto(surface.path);
      await page.waitForLoadState("networkidle");

      const offenders = await alphaFloorOffenders(page, INK_ON_PAPER_FLOOR);

      expect(
        offenders,
        `${surface.label}: ink on paper needs at least ${INK_ON_PAPER_FLOOR * 100}% alpha ` +
          `(DESIGN.md §7 — /55 measures 4.34:1 and fails AA at body size). Use text-ink/60:\n  ` +
          offenders.join("\n  "),
      ).toEqual([]);
    });
  }
});
