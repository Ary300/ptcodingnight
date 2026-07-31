import { expect, test } from "@playwright/test";

import { requiredEnv } from "./helpers/env";

/**
 * `/sign-in`, in a real browser, because none of what follows is visible over HTTP.
 *
 * Every defect pinned here passed the API specs and G7 while being wrong on the page. That is the
 * repeated shape of this project's bugs (see `docs/TODO.md` and the memory note "screens must be
 * verified by using them"): the route answers correctly and the screen does the wrong thing with
 * the answer.
 *
 *  - a passcode refusal rendered three hundred pixels away, under the unrelated PASSWORD field
 *  - an `?error=` reason rendered below the fold, nowhere near the button that produced it
 *  - a `role="alert"` that is in the server's HTML, and therefore announced to nobody
 *  - attacker-authored prose from the query string, rendered as one of our own messages
 *
 * Runs under both browser profiles. Students use phones (PRD §11) and the 360px case is where
 * "below the fold" stops being a nitpick.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

/**
 * Alerts are looked for inside `<main>`, not on the whole document.
 *
 * Next ships a route announcer — a `<p role="alert">` that reads the new page title after a
 * client-side navigation — so an unscoped `getByRole("alert")` matches two nodes and every
 * assertion below fails on strict mode rather than on the thing it is testing.
 */
const alerts = (page: import("@playwright/test").Page) =>
  page.getByRole("main").getByRole("alert");

/** The organizer password form. Two password inputs on this page, so both are addressed by name. */
const passwordField = 'input[autocomplete="current-password"]';
const passcodeField = 'input[autocomplete="off"]';

test.describe("the error banner", () => {
  test("renders the reason for an `?error=` code, and survives a reload", async ({ page }) => {
    await page.goto("/sign-in?error=provider_unconfigured&provider=google");

    const banner = alerts(page);
    await expect(banner).toContainText("Google sign-in is not set up on this server");
    // Names an alternative. A sign-in error with no next step is a dead end, and the room has one
    // organizer for forty students.
    await expect(banner).toContainText("Try the other button");

    await page.reload();
    await expect(alerts(page)).toContainText("not set up on this server");
  });

  test("sits ABOVE the OAuth buttons, which are what produced it", async ({ page }) => {
    /*
      The bug: there was one error slot and it lived under the organizer PASSWORD field, far below
      the two buttons a student presses. On a 360px phone the real three-line message rendered
      below the fold, so pressing "Continue with Google" on a server with no Google configured
      looked like the button did nothing at all.
    */
    await page.goto("/sign-in?error=provider_unconfigured&provider=google");

    const banner = await alerts(page).boundingBox();
    const google = await page.getByRole("link", { name: /Continue with Google/ }).boundingBox();
    const password = await page.locator(passwordField).boundingBox();

    expect(banner).not.toBeNull();
    expect(google).not.toBeNull();
    expect(password).not.toBeNull();
    expect(banner!.y, "the reason renders below the button that caused it").toBeLessThan(google!.y);
    expect(banner!.y, "the reason renders under an unrelated password field").toBeLessThan(
      password!.y,
    );

    // And it is on screen without scrolling, at whatever viewport this profile uses.
    const viewport = page.viewportSize();
    expect(banner!.y + banner!.height).toBeLessThan(viewport?.height ?? 0);
  });

  test("is FOCUSED on arrival, because `role=\"alert\"` alone announces nothing here", async ({
    page,
  }) => {
    /*
      A live region is announced when its content CHANGES. This banner's content is in the server's
      response — the element is already there when the browser parses the document — so there is no
      change for a screen reader to notice, and the one message a student was redirected here to
      read is the one they are least likely to be told about.

      Moving focus is what works across screen readers, and it fixes the sighted equivalent at the
      same time: focus scrolls the banner into view.
    */
    await page.goto("/sign-in?error=cancelled&provider=github");

    /*
      POLLED, because focus is moved by an effect and effects do not run until React has hydrated.
      Reading `document.activeElement` once, immediately after `goto`, is a race that this spec
      won on a quiet machine and lost on a loaded one — it asserted "nobody is focused" a few
      milliseconds before the banner took focus.

      The right correction is here rather than in the component: the behaviour under test is "the
      banner ends up focused", not "the banner is focused within one microtask of navigation".
    */
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
      it, so there was never an XSS — the text itself was the payload. Anyone could hand a student

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
    await page.goto("/sign-in?error=provider_unconfigured&provider=Evil%20Corp%20SSO");

    const visible = await page.evaluate(() => document.body.innerText);
    expect(visible).not.toContain("Evil Corp");
    await expect(alerts(page)).toContainText("That provider");
  });
});

test.describe("the organizer forms", () => {
  test("a wrong passcode reports NEXT TO the passcode box, not under the password", async ({
    page,
  }) => {
    /*
      Screenshot evidence for the bug: `05-wrong-passcode.png`. One shared `error` state, rendered
      in exactly one place — inside the email form — so "That passcode is not right" appeared under
      the PASSWORD field, above an untouched "Sign in" button, three hundred pixels from the
      passcode box the organizer had just used. On a phone it is off screen.
    */
    await page.goto("/sign-in");
    await page.getByText("Organizer passcode").click();
    await page.locator(passcodeField).fill("not-the-passcode");
    await page.getByRole("button", { name: /Open the organizer console/ }).click();

    const alert = alerts(page);
    await expect(alert).toContainText("passcode");

    const alertBox = await alert.boundingBox();
    const passcodeBox = await page.locator(passcodeField).boundingBox();
    const passwordBox = await page.locator(passwordField).boundingBox();

    expect(alertBox!.y, "the passcode error rendered above the passcode box").toBeGreaterThan(
      passcodeBox!.y,
    );
    expect(alertBox!.y, "the passcode error rendered inside the password form").toBeGreaterThan(
      passwordBox!.y + 100,
    );
  });

  test("a wrong password reports inside the password form and says nothing about the passcode", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.locator('input[type="email"]').fill("nobody-at-all@parktudor.org");
    await page.locator(passwordField).fill("not-the-passphrase");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    const alert = alerts(page);
    await expect(alert).toContainText("do not match an account");
    // Never says WHICH half was wrong: that turns the form into an account enumerator, and
    // organizers' addresses are their school addresses.
    await expect(alert).not.toContainText("no such");

    // The fields are marked invalid and point at the message. Both of them, because the server
    // cannot say which one was wrong, so flagging one would be a guess presented as a fact.
    await expect(page.locator(passwordField)).toHaveAttribute("aria-invalid", "true");
    const describedBy = await page.locator(passwordField).getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    await expect(page.locator(`#${describedBy!}`)).toContainText("do not match");
  });

  test("one form's failure does not disable the other form's button", async ({ page }) => {
    // `busy` was a single flag shared by both submit handlers.
    await page.goto("/sign-in");
    await page.getByText("Organizer passcode").click();
    await page.locator(passcodeField).fill("not-the-passcode");
    await page.locator('input[type="email"]').fill("organizer@parktudor.org");
    await page.locator(passwordField).fill("a-long-enough-passphrase");

    await page.getByRole("button", { name: /Open the organizer console/ }).click();
    await expect(alerts(page)).toContainText("passcode");

    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  });

  test("the correct passcode opens the console", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByText("Organizer passcode").click();
    await page.locator(passcodeField).fill(ADMIN_PASSCODE);
    await page.getByRole("button", { name: /Open the organizer console/ }).click();

    await page.waitForURL(/\/admin/);
    // A full navigation, not a router push: the session cookie was just set and the admin layout
    // is a server component that has to be rendered with it.
    expect(new URL(page.url()).pathname).toBe("/admin");
  });
});

test.describe("the page a student meets", () => {
  test("offers both providers and does not ask for a code", async ({ page }) => {
    // The join code is gone. A page that still asks for one is a page that turns students away.
    await page.goto("/sign-in");

    await expect(page.getByRole("link", { name: /Continue with Google/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Continue with GitHub/ })).toBeVisible();

    const text = await page.evaluate(() => document.body.innerText);
    expect(text).toContain("Students do not need a code");
  });

  test("the OAuth buttons are document navigations, not fetches", async ({ page }) => {
    // `/api/auth/{provider}` sets a state cookie and 302s to another origin. A client-side
    // navigation cannot follow that, so these have to stay `<a href>`.
    await page.goto("/sign-in");
    for (const provider of ["google", "github"]) {
      await expect(page.locator(`a[href="/api/auth/${provider}"]`)).toHaveCount(1);
    }
  });

  test("the passcode disclosure starts CLOSED", async ({ page }) => {
    // A passcode field sitting open on the front door invites every student in the room to have a
    // go at it, and what it opens is the console that can rewrite a verdict.
    await page.goto("/sign-in");
    await expect(page.locator(passcodeField)).toBeHidden();
  });

  test("does not scroll sideways at any width a student will use", async ({ page }) => {
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 780 });
      await page.goto("/sign-in?error=no_contest&provider=google");
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
