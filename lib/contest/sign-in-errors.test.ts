import { describe, expect, it } from "vitest";

import {
  SIGN_IN_ERROR_CODES,
  signInErrorLocation,
  signInErrorMessage,
  type SignInErrorCode,
} from "@/lib/contest/sign-in-errors";

/**
 * `?error=` is a closed vocabulary, and these tests are the reason it is one.
 *
 * The regression they pin: `/sign-in` used to render whatever prose arrived in the query string.
 * React escaped it, so there was no XSS — the TEXT was the payload. A link like
 *
 *     /sign-in?error=Your+account+is+locked.+Email+your+password+to+…
 *
 * rendered in the site's own error styling, on the site's own domain, above the site's own sign-in
 * form. The fix is structural rather than a matter of escaping, so the test is structural too:
 * nothing that is not written down in `sign-in-errors.ts` can come out of `signInErrorMessage`.
 */

/** Every sentence the page can render, which is the closed set the assertions below rely on. */
const EVERY_MESSAGE = SIGN_IN_ERROR_CODES.flatMap((code) =>
  ["google", "github", null].map((p) => signInErrorMessage(code, p)),
);

describe("signInErrorMessage", () => {
  it("has a message for every code, and never an empty one", () => {
    for (const code of SIGN_IN_ERROR_CODES) {
      const message = signInErrorMessage(code, "google");
      expect(message, `no copy for ${code}`).not.toBeNull();
      expect((message ?? "").length).toBeGreaterThan(20);
    }
  });

  it("returns null when there is no error, so the banner does not render", () => {
    expect(signInErrorMessage(null, null)).toBeNull();
    expect(signInErrorMessage(undefined, undefined)).toBeNull();
    expect(signInErrorMessage("", "google")).toBeNull();
  });

  it("NEVER echoes an unrecognised code back at the student", () => {
    // The attack that shipped: attacker-authored prose rendered as one of our own messages.
    const injected =
      "Your account is locked. Email your password to security@not-park-tudor.example to restore it.";

    const rendered = signInErrorMessage(injected, "google");

    expect(rendered).not.toContain("not-park-tudor");
    expect(rendered).not.toContain("password");
    // It degrades to the generic sentence rather than to nothing, so the student still learns
    // that the sign-in failed.
    expect(rendered).toBe(signInErrorMessage("unknown", null));
    expect(EVERY_MESSAGE).toContain(rendered);
  });

  it("never lets a stack trace or an exception message through", () => {
    const thrown = "PrismaClientKnownRequestError: Invalid `prisma.user.create()` at /app/lib/db.ts:12";
    const rendered = signInErrorMessage(thrown, null);
    expect(rendered).not.toContain("Prisma");
    expect(rendered).not.toContain("/app/lib");
    expect(EVERY_MESSAGE).toContain(rendered);
  });

  it("only ever substitutes a provider name it recognises", () => {
    // `?provider=` is as attacker-supplied as `?error=`. It is a lookup, not copy.
    const rendered = signInErrorMessage("provider_unconfigured", "Evil Corp SSO");
    expect(rendered).not.toContain("Evil Corp");
    expect(rendered).toContain("That provider");

    expect(signInErrorMessage("provider_unconfigured", "google")).toContain("Google");
    expect(signInErrorMessage("provider_unconfigured", "github")).toContain("GitHub");
  });

  it("tells an organizer what to DO, for every code", () => {
    // A sign-in error with no next step is a dead end, and the room has one organizer for forty
    // students. Each message names an alternative: retry, the other button, or an organizer.
    for (const code of SIGN_IN_ERROR_CODES) {
      const message = (signInErrorMessage(code, "google") ?? "").toLowerCase();
      expect(
        /again|other button|organizer|console/.test(message),
        `${code} leaves the reader with nothing to do: ${message}`,
      ).toBe(true);
    }
  });

  it("says the two configuration failures are OURS, not the student's", () => {
    for (const code of ["provider_unconfigured", "start_failed"] as SignInErrorCode[]) {
      expect(signInErrorMessage(code, "github")).toContain("not your account");
    }
  });

  it("explains the expired-contest state instead of leaving the site looking dead", () => {
    // The production failure this exists for: the demo contest ended, every sign-in produced a
    // session that authorized as nobody, and nothing on any screen said why.
    const message = signInErrorMessage("no_contest", "google") ?? "";
    expect(message).toContain("no contest open");
    expect(message.toLowerCase()).toContain("organizer");
  });
});

describe("signInErrorLocation", () => {
  it("is RELATIVE, so a redirect can never rewrite the origin's scheme", () => {
    // The bug: an absolute Location rebuilt from an invented origin sent a localhost sign-in to
    // `https://localhost:3000`, which the browser reports as "Safari can't open the page".
    for (const code of SIGN_IN_ERROR_CODES) {
      const location = signInErrorLocation(code, "google");
      expect(location.startsWith("/sign-in?")).toBe(true);
      expect(location).not.toContain("://");
    }
  });

  it("round-trips through the query string back to the same message", () => {
    for (const code of SIGN_IN_ERROR_CODES) {
      const params = new URLSearchParams(signInErrorLocation(code, "github").split("?")[1]);
      expect(signInErrorMessage(params.get("error"), params.get("provider"))).toBe(
        signInErrorMessage(code, "github"),
      );
    }
  });

  it("omits the provider when there is not one, rather than inventing a name", () => {
    expect(signInErrorLocation("organizer_required")).toBe("/sign-in?error=organizer_required");
  });
});
