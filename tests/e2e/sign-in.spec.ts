import { expect, test } from "@playwright/test";

import { requiredEnv } from "./helpers/env";

/**
 * `/sign-in`, in a real browser, because none of what follows is visible over HTTP.
 *
 * Since 2026-11-15 this page is the organizer's door and nothing else. The organizer's
 * instruction was "just remove the sign in option since we dont need it anymore": students enter
 * with the join code on their slip, there are no student accounts, and the email form, the
 * provider buttons and the sign-up link that used to share this screen are gone. What is left is
 * the passcode, which is the one credential the runbook depends on (`docs/NIGHT.md`).
 *
 * Every defect pinned here passed the API specs and G7 while being wrong on the page. That is the
 * repeated shape of this project's bugs (see `docs/TODO.md` and the memory note "screens must be
 * verified by using them"): the route answers correctly and the screen does the wrong thing with
 * the answer.
 *
 *  - an `?error=` reason that the page rendered verbatim off the query string
 *  - a `role="alert"` that is in the server's HTML, and therefore announced to nobody
 *  - a passcode refusal that rendered three hundred pixels from the passcode box
 *  - an account form that a student holding a slip was shown before the way back to the slip
 *
 * Runs under both browser profiles. Students use phones (PRD §11) and the 360px case is where
 * "below the fold" stops being a nitpick.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

/**
 * Alerts are looked for inside `<main>`, not on the whole document.
 *
 * Next ships a route announcer, a `<p role="alert">` that reads the new page title after a
 * client-side navigation, so an unscoped `getByRole("alert")` matches two nodes and every
 * assertion below fails on strict mode rather than on the thing it is testing.
 */
const alerts = (page: import("@playwright/test").Page) =>
  page.getByRole("main").getByRole("alert");

/** The one field on the page. By name, so the selector says what it is. */
const passcodeField = 'input[name="signin-passcode"]';

test.describe("the error banner", () => {
  test("renders the reason for an `?error=` code, and survives a reload", async ({ page }) => {
    // The code this page meets in practice: the `/admin` layout sends an expired session here.
    await page.goto("/sign-in?error=organizer_required");

    const banner = alerts(page);
    await expect(banner).toContainText("Sign in as an organizer to open the console");

    await page.reload();
    await expect(alerts(page)).toContainText("Sign in as an organizer");
  });

  test("sits above the passcode field, on screen without scrolling", async ({ page }) => {
    /*
      The bug: there was one error slot and it lived under an unrelated PASSWORD field, far
      below the controls a person had pressed. On a 360px phone the message rendered below the
      fold, so a refused sign-in looked like a button that did nothing at all.
    */
    await page.goto("/sign-in?error=organizer_required");

    const banner = await alerts(page).boundingBox();
    const passcode = await page.locator(passcodeField).boundingBox();

    expect(banner).not.toBeNull();
    expect(passcode).not.toBeNull();
    expect(banner!.y, "the reason renders under the passcode field").toBeLessThan(passcode!.y);

    const viewport = page.viewportSize();
    expect(banner!.y + banner!.height).toBeLessThan(viewport?.height ?? 0);
  });

  test("is FOCUSED on arrival, because `role=\"alert\"` alone announces nothing here", async ({
    page,
  }) => {
    /*
      A live region is announced when its content CHANGES. This banner's content is in the server's
      response, so there is no change for a screen reader to notice, and the one message a person
      was redirected here to read is the one they are least likely to be told about.

      POLLED, because focus is moved by an effect and effects do not run until React has hydrated.
      Reading `document.activeElement` once, immediately after `goto`, is a race that this spec
      won on a quiet machine and lost on a loaded one.
    */
    await page.goto("/sign-in?error=organizer_required");

    await expect
      .poll(
        () => page.evaluate(() => document.activeElement?.getAttribute("role")),
        { message: "the arrival-time error is announced to nobody", timeout: 10_000 },
      )
      .toBe("alert");

    // `tabIndex={-1}`: focusable programmatically, never a stop in the tab order.
    expect(await alerts(page).getAttribute("tabindex")).toBe("-1");
  });

  test("NEVER renders prose handed to it in the query string", async ({ page }) => {
    /*
      `?error=` used to carry the SENTENCE and the page rendered whatever arrived. React escaped
      it, so there was never an XSS; the text itself was the payload. Anyone could hand a person

          /sign-in?error=Your+account+is+locked.+Email+your+password+to+…

      and it rendered in our error styling, on our domain, above our sign-in form: a phishing page
      hosted by us, built out of one query parameter.

      Asserted against the RENDERED text rather than the raw response body. Next serialises
      `searchParams` into the RSC payload at the foot of the document no matter what a page does
      with them, so the raw HTML always contains the string; what matters is that nothing displays
      it.
    */
    const injected = "Your account is locked. Email your password to security@not-park-tudor.example";
    await page.goto(`/sign-in?error=${encodeURIComponent(injected)}`);

    const visible = await page.evaluate(() => document.body.innerText);
    expect(visible).not.toContain("not-park-tudor.example");
    expect(visible).not.toContain("Email your password");

    // It still says the sign-in failed, rather than swallowing it into silence.
    await expect(alerts(page)).toContainText("That sign-in did not finish");
  });

  test("does not invent a provider name from the query string either", async ({ page }) => {
    // The OAuth routes still answer at their URLs and still redirect here with a provider code,
    // so the provider vocabulary stays, and the label is still never taken from the URL.
    await page.goto("/sign-in?error=provider_unconfigured&provider=Evil%20Corp%20SSO");

    const visible = await page.evaluate(() => document.body.innerText);
    expect(visible).not.toContain("Evil Corp");
    await expect(alerts(page)).toContainText("That provider");
  });
});

test.describe("the organizer form", () => {
  test("a wrong passcode reports NEXT TO the passcode box", async ({ page }) => {
    /*
      Screenshot evidence for the old bug: `05-wrong-passcode.png`. One shared `error` state,
      rendered in exactly one place inside the email form, so "That passcode is not right"
      appeared under the PASSWORD field, three hundred pixels from the passcode box the organizer
      had just used. The email form is gone; the property that the refusal sits under the control
      that produced it is kept.
    */
    await page.goto("/sign-in");
    await page.locator(passcodeField).fill("not-the-passcode");
    await page.getByRole("button", { name: /Open the organizer console/ }).click();

    const alert = alerts(page);
    await expect(alert).toContainText("passcode");

    const alertBox = await alert.boundingBox();
    const passcodeBox = await page.locator(passcodeField).boundingBox();
    expect(alertBox).not.toBeNull();
    expect(passcodeBox).not.toBeNull();
    expect(alertBox!.y, "the passcode error rendered above the passcode box").toBeGreaterThan(
      passcodeBox!.y,
    );
    // Within the same column, not a screen away.
    expect(alertBox!.y - (passcodeBox!.y + passcodeBox!.height)).toBeLessThan(80);

    // The field is marked invalid and points at the message.
    await expect(page.locator(passcodeField)).toHaveAttribute("aria-invalid", "true");
    const describedBy = await page.locator(passcodeField).getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    await expect(page.locator(`#${describedBy!}`)).toContainText("passcode");

    // Refused means still here.
    expect(new URL(page.url()).pathname).toBe("/sign-in");
  });

  test("the button is disabled until something is typed, then reacts to what was typed", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    const button = page.getByRole("button", { name: /Open the organizer console/ });
    await expect(button).toBeDisabled();

    await page.locator(passcodeField).fill("something");
    await expect(button).toBeEnabled();
  });

  test("the correct passcode opens the console", async ({ page }) => {
    await page.goto("/sign-in");
    await page.locator(passcodeField).fill(ADMIN_PASSCODE);
    await page.getByRole("button", { name: /Open the organizer console/ }).click();

    await page.waitForURL(/\/admin/);
    // A full navigation, not a router push: the session cookie was just set and the admin layout
    // is a server component that has to be rendered with it.
    expect(new URL(page.url()).pathname).toBe("/admin");
  });
});

test.describe("the page a student meets", () => {
  test("is the organizer page, offers no account door, and points at the join code", async ({
    page,
  }) => {
    /*
      The organizer's instruction: students have no accounts. A student who types /sign-in out of
      habit must find exactly one thing to do, which is to go to /join with the slip in their
      hand. Not an email form, not a provider button, not "Create your account". Each of those
      was on this page until 2026-11-15 and each sent a student holding a slip to make an account
      they did not need.
    */
    await page.goto("/sign-in");

    await expect(page.getByRole("heading", { name: "Organizer sign-in", level: 1 })).toBeVisible();

    const door = page.getByRole("link", { name: "Enter your join code" });
    await expect(door).toBeVisible();
    await expect(door).toHaveAttribute("href", "/join");

    // The only field on the page is the passcode.
    await expect(page.locator("main input")).toHaveCount(1);
    await expect(page.locator(passcodeField)).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.locator('input[autocomplete="current-password"]')).toHaveCount(0);

    // No provider navigation, configured or not.
    await expect(page.locator('a[href^="/api/auth/"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Continue with/ })).toHaveCount(0);

    // No way to make an account.
    await expect(page.locator('a[href="/sign-up"]')).toHaveCount(0);
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).not.toContain("Create your account");
    expect(text).not.toContain("practice account");
    expect(text).not.toContain("Google");
    expect(text).not.toContain("GitHub");
    expect(text).toContain("join code");
  });

  test("/sign-up no longer exists as a screen and lands on /join", async ({ page }) => {
    // The old page was linked from here for months. A bookmark should meet the door that works.
    await page.goto("/sign-up");
    await page.waitForURL((url) => url.pathname === "/join");
    await expect(
      page.getByRole("heading", { name: "Enter your join code", level: 1 }),
    ).toBeVisible();
  });

  test("does not scroll sideways at any width a student will use", async ({ page }) => {
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 780 });
      await page.goto("/sign-in?error=organizer_required");
      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(overflow.scroll, `horizontal overflow at ${String(width)}px`).toBeLessThanOrEqual(
        overflow.client,
      );
    }
  });
});
