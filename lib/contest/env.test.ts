import { describe, expect, it } from "vitest";

import {
  type EnvSource,
  assertAuthEnvIsDeployable,
  cookiesAreSecure,
  parseContestEnv,
} from "@/lib/contest/env";

/**
 * The deployment-shape half of the auth environment.
 *
 * Every test here supplies its own `source` object rather than mutating `process.env`. Vitest
 * runs this file in the same process as everything else, and a test that flipped `NODE_ENV`
 * globally would change the behaviour of any test that happened to run beside it — which is the
 * exact failure mode these checks exist to prevent.
 */

/** The minimum that parses. Nothing here is required, so this is genuinely empty. */
const BASE: EnvSource = {};

describe("COOKIE_SECURE", () => {
  /**
   * The default is the security-relevant part. An operator who has never heard of this variable
   * must get the safe value, because the unsafe one is invisible until someone is on the wire.
   */
  it("defaults to true when unset", () => {
    expect(parseContestEnv(BASE).COOKIE_SECURE).toBe("true");
    expect(cookiesAreSecure(BASE)).toBe(true);
  });

  it("can be turned off for a plain-HTTP dev server", () => {
    expect(cookiesAreSecure({ COOKIE_SECURE: "false" })).toBe(false);
  });

  /**
   * Rejecting anything else matters more than it looks. `COOKIE_SECURE=0`, `no`, `False` and an
   * empty string are all things an operator would plausibly write meaning "off"; a loose parser
   * treats every one of them as truthy-or-not by accident. Refusing them makes the operator say
   * what they mean.
   */
  it.each(["0", "1", "no", "yes", "False", "TRUE", "", " true"])(
    "refuses the ambiguous value %o rather than guessing",
    (value) => {
      expect(() => parseContestEnv({ COOKIE_SECURE: value })).toThrow(/COOKIE_SECURE/);
    },
  );
});

describe("an empty variable means unset, not present-and-invalid", () => {
  /**
   * This took the deployment down. `docker-compose.prod.yml` writes
   * `GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}`, so an unset variable arrives as `""` — which
   * `.min(1).optional()` treats as present and too short:
   *
   *   GITHUB_CLIENT_SECRET: Too small: expected string to have >=1 characters
   *
   * Production then refused to boot. "Leave a provider blank to turn it off" is the documented
   * behaviour, so the documented way to disable OAuth was preventing the site from starting.
   */
  it.each([
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "SESSION_SECRET",
    "ADMIN_PASSCODE",
    "PUBLIC_ORIGIN",
    "TRUSTED_PROXY_COUNT",
  ])("treats an empty %s as absent rather than invalid", (key) => {
    expect(() => parseContestEnv({ [key]: "" })).not.toThrow();
    expect(parseContestEnv({ [key]: "" })[key as "ADMIN_PASSCODE"]).toBeUndefined();
  });

  it("treats whitespace as absent too, since a copied .env line often carries a space", () => {
    expect(parseContestEnv({ ADMIN_PASSCODE: "   " }).ADMIN_PASSCODE).toBeUndefined();
  });

  /** Absent must not become a licence to accept nonsense when a value IS supplied. */
  it("still rejects a value that is present and wrong", () => {
    expect(() => parseContestEnv({ SESSION_SECRET: "too-short" })).toThrow();
    expect(() => parseContestEnv({ ADMIN_PASSCODE: "short" })).toThrow();
    expect(() => parseContestEnv({ PUBLIC_ORIGIN: "not-a-url" })).toThrow();
    expect(() => parseContestEnv({ TRUSTED_PROXY_COUNT: "many" })).toThrow();
  });

  it("keeps a real value", () => {
    expect(parseContestEnv({ GOOGLE_CLIENT_ID: "abc" }).GOOGLE_CLIENT_ID).toBe("abc");
    expect(parseContestEnv({ PUBLIC_ORIGIN: "https://x.test" }).PUBLIC_ORIGIN).toBe(
      "https://x.test",
    );
  });

  /**
   * The end-to-end shape of the failure: a production boot with every OAuth variable blank,
   * which is exactly what compose produces when the operator does not use OAuth.
   */
  it("boots a production deployment that has OAuth turned off by leaving it blank", () => {
    expect(() =>
      assertAuthEnvIsDeployable({
        NODE_ENV: "production",
        SESSION_SECRET: "x".repeat(32),
        ADMIN_PASSCODE: "a-real-passcode",
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
        GITHUB_CLIENT_ID: "",
        GITHUB_CLIENT_SECRET: "",
      }),
    ).not.toThrow();
  });
});

describe("production refuses to start with an insecure cookie", () => {
  it("rejects COOKIE_SECURE=false under NODE_ENV=production", () => {
    expect(() =>
      parseContestEnv({ NODE_ENV: "production", COOKIE_SECURE: "false" }),
    ).toThrow(/COOKIE_SECURE must be true in production/);
  });

  it("accepts COOKIE_SECURE=false outside production", () => {
    expect(cookiesAreSecure({ NODE_ENV: "development", COOKIE_SECURE: "false" })).toBe(false);
    expect(cookiesAreSecure({ NODE_ENV: "test", COOKIE_SECURE: "false" })).toBe(false);
  });

  /**
   * The boot check is the same rule at a different time. Without it a production server starts,
   * serves the join page, and fails only when a room full of students tries to sign in at once.
   */
  it("fails the boot check, not just the first request", () => {
    expect(() =>
      assertAuthEnvIsDeployable({
        NODE_ENV: "production",
        COOKIE_SECURE: "false",
        SESSION_SECRET: "x".repeat(32),
      }),
    ).toThrow(/COOKIE_SECURE must be true in production/);
  });

  it("fails the boot check when production has no SESSION_SECRET", () => {
    expect(() => assertAuthEnvIsDeployable({ NODE_ENV: "production" })).toThrow(
      /SESSION_SECRET is required in production/,
    );
  });

  it("passes the boot check on a correctly configured production environment", () => {
    expect(() =>
      assertAuthEnvIsDeployable({
        NODE_ENV: "production",
        SESSION_SECRET: "x".repeat(32),
      }),
    ).not.toThrow();
  });

  it("does not impose production requirements on a dev boot", () => {
    expect(() => assertAuthEnvIsDeployable({ NODE_ENV: "development" })).not.toThrow();
  });
});

describe("PUBLIC_ORIGIN in production", () => {
  const withGoogle = {
    NODE_ENV: "production",
    SESSION_SECRET: "x".repeat(32),
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
  } as const;

  /**
   * An `http://` origin in production means one of two things, and both are broken: TLS is not
   * really terminated, or the redirect URI will not match the one registered with the provider.
   */
  it("rejects an http origin when a provider is configured", () => {
    expect(() =>
      parseContestEnv({ ...withGoogle, PUBLIC_ORIGIN: "http://ptcodingnight.com" }),
    ).toThrow(/must be https/);
  });

  it("requires an origin at all when a provider is configured", () => {
    expect(() => parseContestEnv({ ...withGoogle })).toThrow(/PUBLIC_ORIGIN is required/);
  });

  it("accepts an https origin", () => {
    expect(() =>
      parseContestEnv({ ...withGoogle, PUBLIC_ORIGIN: "https://ptcodingnight.com" }),
    ).not.toThrow();
  });

  /**
   * A contest running on join codes and passwords alone should not be forced to set a variable
   * it never reads. Requiring it unconditionally would be a startup failure with no cause the
   * operator can act on.
   */
  it("does not require an origin when no provider is configured", () => {
    expect(() =>
      parseContestEnv({ NODE_ENV: "production", SESSION_SECRET: "x".repeat(32) }),
    ).not.toThrow();
  });

  it("leaves development alone", () => {
    expect(() =>
      parseContestEnv({
        NODE_ENV: "development",
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
        PUBLIC_ORIGIN: "http://localhost:3000",
      }),
    ).not.toThrow();
  });
});
