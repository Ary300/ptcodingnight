import { expect, test, type Page } from "@playwright/test";

import { auditPage } from "./helpers/audit";
import { signInAsOrganizer } from "./helpers/journey";

/**
 * G9 — the four screens an organizer works from once the room is full.
 *
 * The live console, the roster, side activities and awards had almost no coverage: the suite
 * audited `/admin/side-activities` and nothing else on the night-of path. These are the screens
 * where a mistake is most expensive, because they are used fast, under time pressure, with
 * students watching — and every one of them writes to a score.
 *
 * ## The horizontal-overflow case, and why it is asserted separately from axe
 *
 * `/admin/contests/{id}/console` measured **467px of document against a 360px viewport**, and
 * `/admin/contests/{id}/awards` measured **541px**. Both looked fine in a screenshot, and axe has
 * nothing to say about either, because what escaped was **visually hidden text**.
 *
 * `.sr-only` is `position:absolute`. An absolutely positioned element is clipped only by an
 * ancestor that is its *containing block* — so the `.sr-only` spans a verdict pill and a standings
 * header render took their static position out at x≈466 *inside* the wide table, and the
 * `overflow-x-auto` box around that table, having no `position` of its own, was not their
 * containing block and did not clip them. The box was working perfectly on everything it could
 * see; what dragged the document sideways was the part nobody can see.
 *
 * That is why the check here is a measurement of `document.documentElement.scrollWidth` rather
 * than a look at the page: this class of defect is invisible by construction, and the only
 * evidence of it is the number.
 *
 * DESIGN.md: 360px must work, and horizontal document overflow is a defect.
 */

const PHONE = { width: 360, height: 780 } as const;

/** The document's own sideways scroll. Anything over the viewport width is the defect. */
async function documentOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/**
 * The contest with the most participants, not "whichever one is running".
 *
 * `runningContestId` reads `/api/standings`, which answers with the most recently started running
 * contest — and on a dev box that is whatever anybody last created. This suite first failed
 * against a contest called "Problems Tab Audit" with no teams and no submissions: every board
 * rendered its empty state, every wait timed out, and four green checks turned red for a reason
 * that had nothing to do with the code under test.
 *
 * These specs are about how a POPULATED board lays out, so they ask for one. An empty board would
 * pass the overflow assertion trivially — there is nothing wide on it — which is worse than
 * failing, because it is a green tick that proves nothing.
 */
async function contestWithData(page: Page): Promise<string> {
  const response = await page.request.get("/api/admin/contests");
  expect(response.ok(), await response.text()).toBe(true);

  const body = (await response.json()) as {
    data?: { contests?: { contestId: string; name: string; participantCount: number }[] };
  };
  const contests = (body.data?.contests ?? []).filter((c) => c.participantCount > 0);

  /*
    The DEMO contest first, by name, and only then the fullest one.

    "Whichever has the most participants" is not stable inside this suite: the competitor specs
    join a contest as they run, so the target moves between one spec and the next, and a console
    with no SUBMISSIONS renders no table however many participants it has. `seed-demo.ts` is the
    one contest guaranteed to have teams, submissions and side activities at once.
  */
  const demo = contests.find((c) => /demo/i.test(c.name));
  const best = demo ?? [...contests].sort((a, b) => b.participantCount - a.participantCount)[0];

  expect(
    best,
    "no contest on this host has any participants. Run `npx tsx scripts/seed-demo.ts` — these " +
      "specs assert how a POPULATED board lays out, and an empty one passes them for free.",
  ).toBeDefined();

  return best?.contestId ?? "";
}

/**
 * What has to be on screen before a measurement means anything, per tab.
 *
 * Not one selector for all four: the roster is a list and has no table at all, and the
 * side-activity history only exists once a team is chosen. Waiting on `table, form` covered
 * three of the four and timed out on the fourth — which reads as a layout failure and is not one.
 */
function readyMarker(page: Page, tab: string) {
  switch (tab) {
    case "console":
      // The feed, not the judge bar: the feed's table is the wide thing being measured.
      return page.getByRole("table", { name: /live submissions feed/i });
    case "awards":
      return page.getByRole("table", { name: /team standings/i });
    case "teams":
      return page.getByRole("heading", { name: /not on a team/i });
    default:
      /*
        By its LABEL, not by `#side-team`. The award form's controls are `components/admin/Field`
        now, and Field generates its ids with `useId()` so the label, hint and error can be tied
        together without a caller inventing three unique strings — which means there is no stable
        hand-written id to select on, and there should not be. The accessible name is the contract.
      */
      return page.getByLabel("Team", { exact: false });
  }
}

test.describe("axe-core: the organizer's night-of screens", () => {
  test("the live console", async ({ page }) => {
    await signInAsOrganizer(page);
    const contestId = await contestWithData(page);
    await page.goto(`/admin/contests/${contestId}/console`);

    // Wait for the CONSOLE, not the heading: the heading is server-rendered and the console
    // fetches after mount, so auditing on the heading audits a spinner and reports it clean.
    await expect(page.getByRole("region", { name: /judge health/i })).toBeVisible();
    await auditPage(page, "/admin/contests/{id}/console");
  });

  test("the roster", async ({ page }) => {
    await signInAsOrganizer(page);
    const contestId = await contestWithData(page);
    await page.goto(`/admin/contests/${contestId}/teams`);

    await expect(page.getByRole("heading", { name: /not on a team/i })).toBeVisible();
    await auditPage(page, "/admin/contests/{id}/teams");
  });

  test("the awards board", async ({ page }) => {
    await signInAsOrganizer(page);
    const contestId = await contestWithData(page);
    await page.goto(`/admin/contests/${contestId}/awards`);

    await expect(page.getByRole("heading", { name: /team results/i })).toBeVisible();
    await auditPage(page, "/admin/contests/{id}/awards");
  });
});

test.describe("360px: the night-of screens must not scroll the document sideways", () => {
  const TABS = ["console", "teams", "side-activities", "awards"] as const;

  for (const tab of TABS) {
    test(`/admin/contests/{id}/${tab}`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await signInAsOrganizer(page);
      const contestId = await contestWithData(page);
      await page.goto(`/admin/contests/${contestId}/${tab}`);
      await page.waitForLoadState("networkidle").catch(() => {
        // The console polls every 3s, so `networkidle` never arrives there. The wait below is
        // what this actually depends on; the idle wait is a best-effort head start.
      });
      // The wide thing is what overflows, and it only exists once its fetch has landed.
      await expect(readyMarker(page, tab)).toBeVisible({ timeout: 30_000 });

      expect(
        await documentOverflow(page),
        `${tab} scrolls the document sideways at 360px. The usual cause is NOT a visible element:\n` +
          "a `.sr-only` span inside a wide table is `position:absolute`, so an `overflow-x-auto`\n" +
          "box only clips it if that box is also `position: relative`. Add `relative` to the\n" +
          "scroller, and `min-w-0` if it is a flex child.",
      ).toBe(0);
    });
  }
});

test.describe("the submission feed names languages the way a human does", () => {
  test("no raw Language enum reaches the screen", async ({ page }) => {
    await signInAsOrganizer(page);
    const contestId = await contestWithData(page);
    await page.goto(`/admin/contests/${contestId}/console`);
    await expect(page.getByRole("region", { name: /judge health/i })).toBeVisible();

    const feed = page.getByRole("table", { name: /live submissions feed/i });
    // An empty feed is a legitimate state and must not silently pass this as a green tick.
    const rows = feed.locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });

    /*
      The enum's shape, not a list of its members: `PYTHON_312`, `JAVASCRIPT_NODE22`, `CPP_17`.
      Matching the shape means a variant added tomorrow is covered without this spec being edited,
      which matters because a language-id rename has four homes in this codebase and three of them
      are data (CLAUDE.md).
    */
    const text = (await feed.innerText()).replace(/\s+/g, " ");
    expect(text, "the feed is printing the raw Language enum instead of VARIANTS[id].label").not.toMatch(
      /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/,
    );
  });
});
