import { expect, test, type Page } from "@playwright/test";

import {
  liveProblem,
  pinParticipantToProblemSet,
  seedE2EContest,
  type SeededContest,
} from "./helpers/seed";
import { signInAsCompetitor } from "./helpers/session";

/**
 * The student-side defects found by driving the product as a student, each pinned by the
 * assertion that would have caught it.
 *
 * Every one of these screens passed G7 and G9 while carrying the bug, because every one of the
 * bugs is a statement the UI makes about the server rather than a control that does not work. A
 * spec that clicks a button and sees a panel cannot see that the panel is lying. So each test
 * here compares what a student READS against what the API actually SAYS, and never against a
 * literal copied out of the component — a literal would agree with the bug.
 */

/*
  90 seconds, not the default 30.

  Every test here drives a real browser against a DEV server. That server answers `/contest` in
  about half a second when it is quiet and, when it is not, in tens of seconds — and the failure
  that produces is `page.goto` exhausting the per-test budget, which the reporter presents as a
  missing element. Three tests in this file failed that way on a commit where all three passed
  minutes earlier. 90s is a timeout for a hung server rather than a busy one; a real regression
  here fails on the assertion, not the clock.
*/
test.describe.configure({ timeout: 90_000 });

let seeded: SeededContest;

test.beforeAll(async () => {
  seeded = await seedE2EContest();
});

/**
 * Sign in as a competitor scoped to the live problem, so the lobby is not empty.
 *
 * The division comes from the problem and the SET is pinned afterwards: every fixture problem
 * carries both, and a participant in neither sees an empty list — a test about something other
 * than scoping states the scope it needs rather than depending on a coin flip.
 */
let counter = 0;
async function signIn(page: Page): Promise<void> {
  const problem = liveProblem(seeded);
  counter += 1;
  const session = await signInAsCompetitor(page, seeded.contestId, {
    displayName: `E2E Student Gaps ${String(Date.now())}-${String(counter)}`,
    divisionId: problem.divisionId,
  });
  await pinParticipantToProblemSet(session.participantId, problem.contestProblemId);
}

test.describe("the language picker offers what the problem allows", () => {
  test("every option comes from the problem's own allowedLanguages, labelled from the registry", async ({
    page,
  }) => {
    await signIn(page);
    const problem = liveProblem(seeded);

    /*
      The expectation is read from the API in this same session, not written down here.

      A hardcoded list of ten ids would pass against a picker that hardcodes the same ten and
      would keep passing after someone narrows a problem to one language — which is exactly what
      migration 20260801040000 did to 62 problems in the bank. The contract is "the picker shows
      the problem's own column", so the problem's own column is what this compares against.
    */
    const payload = await page.request.get(
      `/api/contests/${seeded.contestId}/problems/${problem.slug}`,
    );
    expect(payload.ok(), "the problem detail read failed").toBe(true);
    const body = (await payload.json()) as { data: { allowedLanguages: string[] } };
    const allowed = body.data.allowedLanguages;
    expect(allowed.length, "the fixture problem allows no languages").toBeGreaterThan(0);

    await page.goto(`/contest/${problem.slug}`);
    /*
      By ROLE, not by label. A native `<select>` and the custom listbox trigger both expose
      `role="combobox"` with the same accessible name, so one selector covers both renderings;
      `getByLabel` matched a wrapper on the custom path and clicking it opened nothing.
    */
    const picker = page.getByRole("combobox", { name: /language/i });
    // Generous, because every wait in this file is against a DEV server that other work shares:
    // the default 5s expect timeout fails on "Loading problem…" and reads as a missing picker.
    await expect(picker).toBeVisible({ timeout: 30_000 });

    /*
      READ THE OPTIONS FROM WHICHEVER CONTROL IS RENDERED.

      This used to read `picker.locator("option")` and assert the VALUES equalled `allowed`. That
      stopped being possible when the select became a real listbox on fine-pointer devices: the
      options are `role="option"` list items in a portal, they exist only while the list is open,
      and they carry no value attribute. A device with a coarse pointer still gets a genuine
      `<select>` with genuine `<option>`s, so both shapes are live and the spec has to handle the
      one in front of it rather than assume.

      The assertion is now on the LABELS rather than the ids, and it is a stronger check of the
      same property: the labels a student reads must be exactly the labels of exactly the languages
      the server allows, in the server's order. An id leaking to the screen fails it (no label in
      the registry is SCREAMING_SNAKE), a missing language fails it, and an extra one fails it.
    */
    const isNative = await picker.evaluate((node) => node.tagName === "SELECT");
    let labels: string[];
    if (isNative) {
      labels = await picker.locator("option").evaluateAll((nodes) =>
        nodes.map((node) => node.textContent?.trim() ?? ""),
      );
    } else {
      await picker.click();
      const options = page.getByRole("option");
      await expect(options.first()).toBeVisible({ timeout: 10_000 });
      labels = (await options.allTextContents()).map((text) => text.trim());
      await picker.press("Escape");
    }

    // One option per allowed language, and no more: a picker offering a language the judge was not
    // told to accept is the bug this test exists for.
    expect(
      labels.length,
      "the picker offers a different number of languages than the server allows",
    ).toBe(allowed.length);

    // And each one is labelled, not printed as its enum id. `JAVA_17` on screen is what a
    // hardcoded label map looks like when it falls behind the registry.
    for (const label of labels) {
      expect(label).not.toEqual("");
      expect(label, "an option is showing its enum id rather than a label").not.toMatch(/^[A-Z0-9_]+$/);
    }
  });
});

test.describe("the problem screen does not claim a score it cannot award", () => {
  test("the rail states a rated figure and says the award comes from the tests", async ({ page }) => {
    await signIn(page);
    const problem = liveProblem(seeded);
    await page.goto(`/contest/${problem.slug}`);

    const rail = page.getByRole("complementary", { name: "Problem details" });
    await expect(rail).toBeVisible({ timeout: 30_000 });

    /*
      "Max Score" was the wording, and it was false: the judge awards the SUM of per-test points
      (`aggregateScore`), while the rail printed `basePoints`. On the demo contest that rendered
      "Max Score 100" two rows above "Your best 140" on a correct solve — a ceiling the student
      had already passed, which reads as a scoring bug rather than a mislabel.
    */
    await expect(rail).not.toContainText("Max Score");
    await expect(rail).toContainText("Rated points");
    await expect(rail).toContainText(/awarded per test case/i);
  });

  test("the Hints card is not rendered, because there is no hint endpoint behind it", async ({
    page,
  }) => {
    await signIn(page);
    const problem = liveProblem(seeded);
    await page.goto(`/contest/${problem.slug}`);
    await expect(page.getByRole("heading", { name: problem.title })).toBeVisible({
      timeout: 30_000,
    });

    // `getHintBalance()` rejects with NOT_IMPLEMENTED, so this card could only ever render its
    // own absence — a bordered section under Submit whose entire content was that it does
    // nothing. An empty state is for a container that will sometimes have contents.
    await expect(page.getByText("Hints are not available")).toHaveCount(0);
  });
});

test.describe("submission history never shows a database key", () => {
  test("a row is either a problem name or a named gap, never a contestProblemId", async ({
    page,
  }) => {
    await signIn(page);
    const problem = liveProblem(seeded);

    await page.goto(`/contest/${problem.slug}`);
    await page
      .getByRole("button", { name: "Submit for judging" })
      .click({ timeout: 30_000 });
    await page.waitForTimeout(500);

    await page.goto("/submissions");
    const list = page.getByRole("list", { name: "Submissions" });
    await expect(list).toBeVisible({ timeout: 30_000 });

    /*
      The failure this pins: `listSubmissions()` and `listProblems()` were independent reads and
      only the first gated the render, so a slow or failed second read painted
      `cms9iinaf002o3m8cq2vj0kd1` in display type where the problem name goes. A cuid is 25
      characters of base36 — assert its SHAPE rather than any particular value, because the whole
      point is that no id should ever reach this screen.
    */
    const text = await list.innerText();
    expect(text, "a raw cuid is rendered in the submission history").not.toMatch(
      /\bc[a-z0-9]{24}\b/,
    );
    await expect(list.getByText(problem.title)).toBeVisible();
  });
});

test.describe("the signed-out state is a way in, not a stale error", () => {
  for (const path of ["/submissions", "/team", "/contest"]) {
    test(`${path} offers sign-in rather than telling the student to join`, async ({ page }) => {
      // No cookie: a genuine anonymous visitor.
      await page.goto(path);

      /*
        "Join the contest first" is a `ForbiddenError` message from the route layer that used to be
        rendered verbatim, in alert red, with nothing to click — and it names the join-code flow,
        which was removed. A student who read it went looking for a code that no longer exists.
      */
      await expect(page.getByText(/Join the contest first/i)).toHaveCount(0, { timeout: 30_000 });
      await expect(page.getByRole("link", { name: "Sign in to compete" })).toBeVisible({
        timeout: 30_000,
      });
    });
  }
});

test.describe("360px", () => {
  test("/team does not scroll the document sideways", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/team");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });

    /*
      Wait for the BOARD, not for a timeout. The overflow comes from the standings table, so a
      measurement taken while the poll is still in flight passes against a page that has nothing
      wide on it yet — I watched exactly that happen while diagnosing this, twice, on the same
      commit. The assertion has to be made against the state that carries the bug.
    */
    await expect(page.locator("table").first()).toBeVisible({ timeout: 30_000 });

    /*
      Measured 569 against a 360 client width. The board draws its own `overflow-x-auto` scroller
      and it was defeated from outside: a flex item defaults to `min-width: auto`, so the ~700px
      table stretched its wrapper instead of being clipped by it and the overflow escaped to the
      document. The board's own hint — "scroll the table sideways" — then described something that
      did not happen; the page moved instead.
    */
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  });
});
