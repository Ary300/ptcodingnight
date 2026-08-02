import { expect, test, type Page } from "@playwright/test";

import { requiredEnv } from "./helpers/env";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7 — a first-time organizer goes from nothing to a contest, without ever re-identifying it.
 *
 * ## The complaint this is the regression guard for
 *
 * The reported bug was one line of JSX: the success bar after creating a contest rendered "Build
 * the roster" → `/admin/teams?contest=<the new id>` next to "Add problems" → bare `/admin/problems`
 * with the id dropped. Clicking it landed on a wall of thirteen contests — two of them identically
 * named, because the create form stayed live after a successful create — where the organizer had
 * to re-find by name the contest they had made four seconds earlier.
 *
 * Fixing that one href would not have been a fix. Five organizer screens read their contest from
 * `?contest=<id>` and **no nav link carried it**, so the same failure was one careless href away
 * from coming back, for ever. The id moved into the path, and the assertions below are about that
 * property rather than about any one link:
 *
 *  - creating ENDS inside the contest, so there is nothing to click wrongly;
 *  - the tab strip's hrefs all contain the id, checked as a set, so a sixth tab cannot forget;
 *  - hopping to Problems shows the line-up with **no picker in between**, which is the assertion
 *    that would have failed on the shipped code.
 *
 * ## Why it drives the browser rather than the API
 *
 * The routes were never the problem. Every one of them worked when called with the right id. What
 * did not work was finding the id by clicking, and that can only be tested by clicking.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

/** Every contest this spec makes, so `afterAll` can take them back out of the dev database. */
const CREATED_PREFIX = "E2E Setup Flow ";

/**
 * Serial because the contest made in the second test is the one every later test acts on.
 *
 * The generous timeout is about the DEV server, not about the product: these are the first visits
 * to six freshly added routes, and Next compiles each one on demand. A 30 s default made the first
 * hop to the Problems tab fail while the page was still being built — which reads as "the tab does
 * not navigate", the exact opposite of what was measured.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

test.afterAll(async () => {
  await testDb().contest.deleteMany({ where: { name: { startsWith: CREATED_PREFIX } } });
  await closeTestDb();
});

/** The real door: the passcode disclosure on `/sign-in`, which is what a human uses. */
async function signInAsOrganizer(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByText("Organizer passcode").click();
  // The same selector `sign-in.spec.ts` uses: the passcode input is the one control on the page
  // that opts out of autofill, because a browser offering to remember it is a browser leaking it.
  await page.locator('input[autocomplete="off"]').fill(ADMIN_PASSCODE);
  await page.getByRole("button", { name: /Open the organizer console/ }).click();
  await page.waitForURL(/\/admin/, { timeout: 60_000 });
}

/** `datetime-local` wants wall-clock text in the browser's zone, not an ISO instant. */
function localValue(when: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${String(when.getFullYear())}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `T${pad(when.getHours())}:${pad(when.getMinutes())}`
  );
}

test.describe("an organizer creates a contest and never has to find it again", () => {
  let contestId = "";
  let contestName = "";

  test("/admin is the contest list, and the only door off it is Create contest", async ({ page }) => {
    await signInAsOrganizer(page);

    // The heading is "Contests", not "Coding Night": this screen used to be six link-cards
    // duplicating the nav bar directly above them, with no list of contests anywhere in the
    // product and no way to create one.
    await expect(page.getByRole("heading", { level: 1, name: "Contests" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create contest" }).first()).toBeVisible();
  });

  test("creating one lands INSIDE it, not back on the form", async ({ page }) => {
    await signInAsOrganizer(page);
    await page.getByRole("link", { name: "Create contest" }).first().click();
    await page.waitForURL("**/admin/contests/new", { timeout: 60_000 });

    contestName = `${CREATED_PREFIX}${String(Date.now())}`;
    const now = Date.now();
    await page.getByLabel("Contest name").fill(contestName);
    await page.getByLabel("Starts at").fill(localValue(new Date(now + 60 * 60_000)));
    await page.getByLabel("Ends at").fill(localValue(new Date(now + 4 * 60 * 60_000)));

    await page.getByRole("button", { name: "Create contest" }).click();

    // The contest's own URL, with the id in the PATH. This is the assertion the shipped build
    // failed: it stayed on `/admin/contest` with the form still filled and the button still live,
    // which is how two contests with the same name got made four seconds apart.
    await page.waitForURL(/\/admin\/contests\/[^/]+\/setup$/, { timeout: 20_000 });
    contestId = new URL(page.url()).pathname.split("/")[3] ?? "";
    expect(contestId).not.toBe("");

    // Identity is stated once, at the top, and it is the contest — not the screen.
    await expect(page.getByRole("heading", { level: 1, name: contestName })).toBeVisible();

    const row = await testDb().contest.findUniqueOrThrow({
      where: { id: contestId },
      select: { name: true, state: true },
    });
    expect(row.name).toBe(contestName);
    expect(row.state).toBe("DRAFT");
  });

  test("every tab carries the contest, checked as a set rather than one link", async ({ page }) => {
    await signInAsOrganizer(page);
    await page.goto(`/admin/contests/${contestId}/setup`);

    const hrefs = await page
      .locator('nav[aria-label="Contest sections"] a')
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));

    expect(hrefs.length).toBeGreaterThanOrEqual(6);
    // The property, not a list of expected strings: a seventh tab added later is covered by this
    // and would have to go out of its way to break it.
    for (const href of hrefs) {
      expect(href, `every contest tab must carry the contest id: ${href}`).toContain(contestId);
    }
  });

  test("the checklist names what is left, and says the line-up is the blocker", async ({ page }) => {
    await signInAsOrganizer(page);
    await page.goto(`/admin/contests/${contestId}/setup`);

    // `Panel` renders an unnamed <section>, so there is no `region` role to ask for by name.
    const checklist = page.locator("section").filter({ hasText: "Before this contest can run" });
    await expect(checklist).toContainText("Nothing in the line-up yet");
    // The same fact `setContestState` refuses on, shown BEFORE the organizer presses Publish
    // rather than as the response to pressing it.
    await expect(checklist).toContainText("cannot be published");
  });

  test("Add problems is one click from here and needs no picker", async ({ page }) => {
    await signInAsOrganizer(page);
    await page.goto(`/admin/contests/${contestId}/setup`);

    await page.getByRole("link", { name: "Problems", exact: true }).first().click();
    await page.waitForURL(`**/admin/contests/${contestId}/problems`, { timeout: 60_000 });

    // Wait for the bank, because the line-up panel renders behind it.
    await expect(page.getByRole("heading", { name: /This contest's line-up/i })).toBeVisible({
      timeout: 30_000,
    });

    // THE assertion. The old flow put a thirteen-row "Which contest?" list here.
    await expect(page.getByRole("region", { name: /choose a contest/i })).toHaveCount(0);
    // And the screen says which contest it is acting on, from the shell above it.
    await expect(page.getByRole("heading", { level: 1, name: contestName })).toBeVisible();
  });

  test("a saved line-up is still there on the next visit", async ({ page }) => {
    await signInAsOrganizer(page);
    await page.goto(`/admin/contests/${contestId}/problems`);
    await expect(page.getByRole("heading", { name: /Problem bank/i })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await page.getByRole("button", { name: /Save this line-up/ }).click();
    await expect(page.getByText(/^Saved\./)).toBeVisible({ timeout: 15_000 });

    // The bug this guards: `PUT .../problems` REPLACES the line-up and there is no GET beside it,
    // so this screen used to mount with an empty basket every time — the tab of a contest holding
    // six problems read "Nothing chosen yet", and Save, the only button on it, deleted all six.
    await page.reload();
    await expect(page.getByRole("heading", { name: /This contest's line-up/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("table", { name: "Problems in this contest" }).locator("tbody tr"),
    ).toHaveCount(1);
  });

  test("publishing happens inside the contest, and the checklist follows", async ({ page }) => {
    await signInAsOrganizer(page);
    await page.goto(`/admin/contests/${contestId}/setup`);

    await page.getByRole("button", { name: "Publish", exact: true }).click();

    await expect(
      page.locator("section").filter({ hasText: "Before this contest can run" }),
    ).toContainText("Published.", { timeout: 15_000 });

    const row = await testDb().contest.findUniqueOrThrow({
      where: { id: contestId },
      select: { state: true },
    });
    expect(row.state).toBe("SCHEDULED");
  });
});

test.describe("the old flat URLs still lead somewhere", () => {
  test("a bookmarked contest-scoped URL redirects into that contest's tab", async ({ page }) => {
    await signInAsOrganizer(page);

    const contest = await testDb().contest.findFirstOrThrow({ select: { id: true } });
    await page.goto(`/admin/teams?contest=${contest.id}`);
    await expect(page).toHaveURL(new RegExp(`/admin/contests/${contest.id}/teams$`));
  });

  test("the same URL with no contest asks which one, rather than 404ing", async ({ page }) => {
    await signInAsOrganizer(page);
    await page.goto("/admin/side-activities");

    await expect(page.getByRole("heading", { name: /side activities/i }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: /choose a contest/i })).toBeVisible();
  });

  test("/admin/contest still reaches the create form", async ({ page }) => {
    await signInAsOrganizer(page);
    await page.goto("/admin/contest");
    await expect(page).toHaveURL(/\/admin\/contests\/new$/);
  });

  test("a contest id that does not exist says so and still offers a way out", async ({ page }) => {
    await signInAsOrganizer(page);
    await page.goto("/admin/contests/not-a-real-contest/side-activities");

    // Not `notFound()`: an organizer reaches this by editing a URL or following a stale bookmark,
    // and a 404 page would replace the only navigation back out.
    await expect(page.getByText(/no contest with that id/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Contests" }).first()).toBeVisible();
  });
});
