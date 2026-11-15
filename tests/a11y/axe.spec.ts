import { expect, test } from "@playwright/test";

import { auditPage } from "./helpers/audit";
import { openLobby, openProblem } from "./helpers/journey";

/**
 * G9 — axe-core on the three surfaces PRD §12 names: competitor, problem, projector.
 *
 * Also the sign-in screen and the submissions history, because they are on the same walk and a
 * student who cannot get through sign-in never reaches the ones that were audited.
 *
 * `/join` is audited because it is the door every student walks through on the night (the
 * organizer's decision: "the join code system, not login"). `/sign-in` is audited too, including
 * the `?error=` state the OAuth callback redirects to, because it is how an organizer gets in.
 */

test.describe("axe-core: zero critical or serious", () => {
  /*
    The two pages a visitor can reach without a session or a code, and the two that had no
    coverage because until recently one was a placeholder and the other did not exist.

    They matter more than their simplicity suggests: `/` is the root of ptcodingnight.com and
    `/sign-in` is the only way an organizer gets in. A student who cannot use the front door
    never reaches the surfaces the rest of this file audits.
  */
  test("landing", async ({ page }) => {
    await page.goto("/");
    // The h1 is the hero line, not the site name. The site name lives in the bar above it.
    await expect(
      page.getByRole("heading", { level: 1, name: /Code with your team/i }),
    ).toBeVisible();
    // The primary call to action is the join code, because that is how a student gets in on the
    // night: a printed slip, one code per seat, no account. `.first()` because it appears in the
    // bar, again in the hero and again in the closing band, on purpose. Account sign-in is still
    // on the page, demoted to a quiet link for organizers and the practice arena.
    await expect(page.getByRole("link", { name: "Enter your join code" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in", exact: true }).first()).toBeVisible();

    // The two students who run the night are named on the page, and their photographs carry their
    // names. A headshot is information about a person, so `alt=""` would be wrong here — and an
    // unnamed image next to a name is exactly the pairing axe cannot tell apart from a decoration.
    await expect(page.getByRole("heading", { name: "Sameer Zaidi", level: 3 })).toBeVisible();
    await expect(page.getByRole("img", { name: "Aryav Das" })).toBeVisible();

    await auditPage(page, "/");
  });

  test("join with a code", async ({ page }) => {
    await page.goto("/join");
    await expect(
      page.getByRole("heading", { name: "Enter your join code", level: 1 }),
    ).toBeVisible();
    // The field is labelled and described: the hint about the code's shape is what a student at
    // the desk reads when a character will not go in, so it has to be announced with the field.
    const field = page.getByLabel("Your join code");
    await expect(field).toBeVisible();
    await expect(field).toHaveAttribute("aria-describedby", "join-code-hint");
    await auditPage(page, "/join");
  });

  test("organizer sign-in", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
    // The join code leads the page, above the account form, for the student who typed this URL
    // out of habit. Audited with it in place because it is a filled panther control on a tinted
    // panel, which is a new ground for the contrast rules to meet.
    await expect(
      page.getByRole("link", { name: "Have a join code? Enter it here" }),
    ).toBeVisible();
    await auditPage(page, "/sign-in");

    // The error state is a different DOM — the OAuth callback redirects here with `?error=`
    // when a provider reports one, and a live region that fails an audit fails it silently.
    // `?error=` is a CODE now, not the sentence. It used to carry the prose and the page rendered
    // whatever arrived, which made `/sign-in` a phishing page anyone could author with a link;
    // `lib/contest/sign-in-errors.ts` owns the copy. Audited through the same door a student
    // arrives by, so the URL here is the one the callback actually redirects to.
    await page.goto("/sign-in?error=cancelled&provider=google");
    // By text, not by role: Next.js renders its own `role="alert"` route announcer on every
    // page, so `getByRole("alert")` is two elements here and neither strict mode nor a reader
    // of this test can tell which one was meant.
    await expect(page.getByText("Google sign-in was cancelled before it finished")).toBeVisible();
    await auditPage(page, "/sign-in (provider error)");
  });

  test("competitor lobby", async ({ page }) => {
    await openLobby(page);
    await auditPage(page, "/contest");

    // The filter rail is a set of checkbox groups, which is exactly the shape a missing
    // `legend`/label pair hides in — and an unlabelled checkbox is unusable rather than merely
    // untidy.
    await page.getByRole("checkbox", { name: "Unsolved" }).check();
    await auditPage(page, "/contest (filtered)");
  });

  test("competitor lobby with the account menu open", async ({ page }) => {
    // An open dropdown is a different DOM and a classic place for a trap: a menu with no
    // accessible name, items that are not reachable, or — as happened here — items rendered in
    // the dark bar's paper text on a paper panel, invisible but perfectly "present".
    await openLobby(page);
    await page.locator('header button[aria-haspopup="menu"]').click();
    await expect(page.getByRole("menu", { name: "Account" })).toBeVisible();
    await auditPage(page, "/contest (account menu open)");
  });

  test("problem workspace", async ({ page }) => {
    await openProblem(page);
    await auditPage(page, "/contest/[slug]");
  });

  test("problem workspace with a verdict on screen", async ({ page }) => {
    await openProblem(page);

    // The verdict panel is `--ink` ground with `--paper` text — the inverse of every other
    // competitor surface, and the one place gold/rise/fall are used at all. Auditing the page
    // without it would skip the contrast that is hardest to get right.
    await page.getByRole("button", { name: "Run samples" }).click();
    await expect(page.getByRole("region", { name: "Sample run" })).toBeVisible();
    await auditPage(page, "/contest/[slug] (sample results)");

    await page.getByRole("button", { name: "Submit for judging" }).click();
    const verdict = page.getByRole("region", { name: "Verdict" });
    await expect(verdict).toBeVisible();
    await expect(
      verdict
        .locator("header")
        .getByText(/Accepted|Wrong answer|Too slow|Out of memory|Runtime error|Did not compile/),
    ).toBeVisible({ timeout: 60_000 });
    await auditPage(page, "/contest/[slug] (verdict)");
  });

  test("my submissions", async ({ page }) => {
    await openLobby(page);
    await page.getByRole("link", { name: "My submissions" }).click();
    await page.waitForURL("**/submissions");
    await auditPage(page, "/submissions");
  });

  /**
   * The heading is `Team standings`, not `Park Tudor Coding Night`.
   *
   * These two asserted the individual board's heading and kept asserting it after teams became the
   * default at `/projector` (b5efe9e). That is not a cosmetic staleness — an assertion for a
   * heading that no longer exists fails on the *first line* of the test, so **the audit below it
   * never ran**, and the projector board the room stares at for an hour was silently unaudited at
   * both projector resolutions while the gate reported the reason as a missing heading.
   */
  test("projector", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/projector");
    await expect(page.getByRole("heading", { name: /team standings/i })).toBeVisible();
    await auditPage(page, "/projector");
  });

  test("projector at the smaller of the two projector resolutions", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/projector");
    await expect(page.getByRole("heading", { name: /team standings/i })).toBeVisible();
    await auditPage(page, "/projector @1280x720");
  });
});

test.describe("competitor surfaces are usable at 360px (DESIGN.md §7)", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test("nothing on the problem page overflows the viewport horizontally", async ({ page }) => {
    await openProblem(page);
    await auditPage(page, "/contest/[slug] @360px");

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
    });

    // A student on a phone should never have to scroll sideways to reach Submit.
    expect(
      overflow.scrollWidth,
      `the page is ${overflow.scrollWidth}px wide in a ${overflow.clientWidth}px viewport`,
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });

  test("the lobby fits too", async ({ page }) => {
    await openLobby(page);
    await auditPage(page, "/contest @360px");
  });

  /*
    The front door, which had no 360 test and needed one.

    The site bar reached four items when the join-code link landed next to "Log in" and "Create
    account". The row measured 358px inside a 328px content box, so `/` pushed the whole document
    sideways on a phone — on the one page every visitor sees first, and with every gate green.
    The bar wraps now; this is the measurement that says so.
  */
  test("the landing page does not push the document sideways", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Site" })).toBeVisible();

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
    });
    expect(
      overflow.scrollWidth,
      `/ is ${String(overflow.scrollWidth)}px wide in a ${String(overflow.clientWidth)}px viewport`,
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);

    await auditPage(page, "/ @360px");
  });
});
