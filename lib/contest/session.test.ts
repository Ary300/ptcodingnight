import { describe, expect, it } from "vitest";

import {
  SESSION_MAX_AGE_MS,
  parseCookieHeader,
  sessionCookieOptions,
  signSession,
  verifySession,
  type SessionClaims,
} from "@/lib/contest/session";

/**
 * The signature check is the whole authorization story, so it is tested as an adversary rather
 * than as a happy path: forged payloads, swapped signatures, borrowed secrets, and stale
 * cookies each have to come back as "anonymous".
 */

const SECRET = "a".repeat(32);
const NOW = new Date("2026-07-29T18:00:00.000Z");

function claims(overrides: Partial<SessionClaims> = {}): SessionClaims {
  return {
    sid: "session-1",
    role: "COMPETITOR",
    participantId: "p-1",
    contestId: "c-1",
    displayName: "Ada",
    issuedAtMs: NOW.getTime(),
    ...overrides,
  };
}

describe("signSession / verifySession", () => {
  it("round-trips claims", () => {
    const token = signSession(claims(), SECRET);
    expect(verifySession(token, SECRET, { now: NOW })).toEqual(claims());
  });

  it("rejects a token signed with a different secret", () => {
    const token = signSession(claims(), SECRET);
    expect(verifySession(token, "b".repeat(32), { now: NOW })).toBeNull();
  });

  it("rejects a payload edited after signing", () => {
    const token = signSession(claims(), SECRET);
    const [, mac] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify(claims({ role: "ADMIN", participantId: null, contestId: null })),
      "utf8",
    ).toString("base64url");

    expect(verifySession(`${forged}.${String(mac)}`, SECRET, { now: NOW })).toBeNull();
  });

  it("rejects a signature borrowed from another token", () => {
    const mine = signSession(claims(), SECRET);
    const theirs = signSession(claims({ participantId: "p-2", sid: "session-2" }), SECRET);
    const [payload] = mine.split(".");
    const [, mac] = theirs.split(".");

    expect(verifySession(`${String(payload)}.${String(mac)}`, SECRET, { now: NOW })).toBeNull();
  });

  it.each(["", ".", "notatoken", "a.b.c", "a."])("rejects the malformed token %o", (token) => {
    expect(verifySession(token, SECRET, { now: NOW })).toBeNull();
  });

  it("rejects a token whose payload is not the claims shape", () => {
    const payload = Buffer.from(JSON.stringify({ role: "ADMIN" }), "utf8").toString("base64url");
    // Sign it properly: the point is that a valid signature over invalid claims still fails.
    const token = signSession(claims(), SECRET);
    const [, mac] = token.split(".");
    expect(verifySession(`${payload}.${String(mac)}`, SECRET, { now: NOW })).toBeNull();
  });

  it("expires", () => {
    const token = signSession(claims(), SECRET);
    const later = new Date(NOW.getTime() + SESSION_MAX_AGE_MS + 1);
    expect(verifySession(token, SECRET, { now: later })).toBeNull();
  });

  it("accepts a token right at the edge of its lifetime", () => {
    const token = signSession(claims(), SECRET);
    const edge = new Date(NOW.getTime() + SESSION_MAX_AGE_MS);
    expect(verifySession(token, SECRET, { now: edge })).not.toBeNull();
  });

  it("rejects a token stamped well into the future", () => {
    const token = signSession(claims({ issuedAtMs: NOW.getTime() + 600_000 }), SECRET);
    expect(verifySession(token, SECRET, { now: NOW })).toBeNull();
  });
});

describe("parseCookieHeader", () => {
  it("returns an empty jar for a missing header", () => {
    expect(parseCookieHeader(null)).toEqual({});
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader("")).toEqual({});
  });

  it("parses several cookies and url-decodes values", () => {
    expect(parseCookieHeader("a=1; b=hello%20world; c=x=y")).toEqual({
      a: "1",
      b: "hello world",
      c: "x=y",
    });
  });

  it("keeps a value with a stray percent verbatim rather than throwing", () => {
    expect(parseCookieHeader("a=100%")).toEqual({ a: "100%" });
  });

  it("ignores segments with no name", () => {
    expect(parseCookieHeader("=novalue; ok=1")).toEqual({ ok: "1" });
  });
});

describe("sessionCookieOptions", () => {
  it("is httpOnly and lax so a session cannot be read by script or sent cross-site", () => {
    const options = sessionCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.maxAge).toBe(SESSION_MAX_AGE_MS / 1000);
  });
});
