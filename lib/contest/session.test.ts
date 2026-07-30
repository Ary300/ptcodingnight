import { describe, expect, it } from "vitest";

import {
  SESSION_COOKIE,
  clearedSessionCookieOptions,
  hashSessionToken,
  newSessionToken,
  parseCookieHeader,
  sessionCookieOptions,
  sessionHashesMatch,
} from "@/lib/contest/session";

/**
 * The pure half of the session layer.
 *
 * The cookie used to BE the session — a signed claims blob verified with no server-side lookup —
 * and this file used to test that signature as an adversary. It now tests the token and cookie
 * primitives instead, because the authorization decision moved into Postgres where it can be
 * revoked mid-contest.
 *
 * "A revoked session stops working" is only meaningful against a real database, so it lives in
 * `tests/e2e/session-revocation.api.spec.ts` rather than here.
 */

describe("newSessionToken", () => {
  it("never returns the same token twice", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => newSessionToken()));
    expect(tokens.size).toBe(500);
  });

  it("carries enough entropy that storing only a fast hash is safe", () => {
    // 32 random bytes in base64url. If this ever shrinks, hashSessionToken's use of plain
    // SHA-256 rather than a slow KDF stops being justifiable — the safety rests on there being
    // no dictionary to attack, not on a work factor.
    const token = newSessionToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("hashSessionToken", () => {
  it("is stable for the same token", () => {
    const token = newSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("differs for different tokens", () => {
    expect(hashSessionToken(newSessionToken())).not.toBe(hashSessionToken(newSessionToken()));
  });

  it("never returns the token itself", () => {
    // The point of hashing at rest: a database dump must not yield usable cookies.
    const token = newSessionToken();
    expect(hashSessionToken(token)).not.toBe(token);
    expect(hashSessionToken(token)).not.toContain(token);
  });
});

describe("sessionHashesMatch", () => {
  it("accepts an identical hash and rejects a different one", () => {
    const a = hashSessionToken("one");
    expect(sessionHashesMatch(a, hashSessionToken("one"))).toBe(true);
    expect(sessionHashesMatch(a, hashSessionToken("two"))).toBe(false);
  });

  it("returns false rather than throwing on a length mismatch", () => {
    // timingSafeEqual throws on mismatched lengths, and a throw here would turn a malformed
    // cookie into a 500 instead of an anonymous viewer.
    expect(sessionHashesMatch("short", hashSessionToken("x"))).toBe(false);
    expect(sessionHashesMatch("", "")).toBe(true);
  });
});

describe("parseCookieHeader", () => {
  it("reads the session cookie out of a realistic header", () => {
    const jar = parseCookieHeader(`theme=dark; ${SESSION_COOKIE}=abc-def; other=1`);
    expect(jar[SESSION_COOKIE]).toBe("abc-def");
  });

  it("is empty for a missing or blank header", () => {
    expect(parseCookieHeader(null)).toEqual({});
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader("")).toEqual({});
  });

  it("ignores malformed segments instead of throwing", () => {
    const jar = parseCookieHeader("=novalue; ; noequals; good=1");
    expect(jar.good).toBe("1");
  });

  it("takes a percent-mangled value verbatim rather than failing to decode", () => {
    // Let the store's lookup reject it; a stray % is not a 500.
    const jar = parseCookieHeader(`${SESSION_COOKIE}=100%bad`);
    expect(jar[SESSION_COOKIE]).toBe("100%bad");
  });
});

describe("sessionCookieOptions", () => {
  it("is httpOnly and lax so script cannot read it and links still work", () => {
    const options = sessionCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  it("expresses maxAge in seconds", () => {
    expect(sessionCookieOptions(60_000).maxAge).toBe(60);
  });

  it("clears with maxAge 0", () => {
    expect(clearedSessionCookieOptions().maxAge).toBe(0);
  });
});
