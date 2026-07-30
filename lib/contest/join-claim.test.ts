import { describe, expect, it } from "vitest";

import {
  JOIN_CLAIM_MAX_AGE_MS,
  joinClaimCookieOptions,
  mintJoinClaim,
  readJoinClaim,
} from "@/lib/contest/join-claim";
import { SESSION_MAX_AGE_MS } from "@/lib/contest/session";

/**
 * The join claim, tested as an adversary.
 *
 * This cookie decides which participant a browser is handed back. If it can be forged, it is not a
 * fix for T5 — it is a way to take over another student's participant, their submissions and their
 * score by pasting an id that appears in their own API responses.
 */

const SECRET = "test-secret-at-least-thirty-two-characters-long";
const OTHER_SECRET = "a-completely-different-secret-of-the-same-kind!!";

const PARTICIPANT = "clx0000000000000000000001";
const CONTEST = "clx0000000000000000000002";

describe("mint and read", () => {
  it("round-trips the participant and contest it was minted for", () => {
    const claim = readJoinClaim(mintJoinClaim(PARTICIPANT, CONTEST, SECRET), SECRET);
    expect(claim).toEqual({ participantId: PARTICIPANT, contestId: CONTEST });
  });

  it("returns null for a browser that has never joined", () => {
    expect(readJoinClaim(undefined, SECRET)).toBeNull();
    expect(readJoinClaim("", SECRET)).toBeNull();
  });
});

describe("forgery", () => {
  /**
   * The attack the signature exists to stop: a student reads another participant's id out of a
   * response they are entitled to see, and writes it into their own cookie.
   */
  it("rejects an unsigned participant id", () => {
    expect(readJoinClaim(`${PARTICIPANT}.${CONTEST}`, SECRET)).toBeNull();
    expect(readJoinClaim(PARTICIPANT, SECRET)).toBeNull();
  });

  it("rejects a valid signature over a different participant", () => {
    const victim = "clx0000000000000000000009";
    const mine = mintJoinClaim(PARTICIPANT, CONTEST, SECRET);
    const signature = mine.split(".")[2];
    expect(readJoinClaim(`${victim}.${CONTEST}.${signature ?? ""}`, SECRET)).toBeNull();
  });

  /**
   * Binding the contest into the signed payload is what makes a claim from a previous contest a
   * mismatch rather than a lookup that happens to miss.
   */
  it("rejects a claim replayed into another contest", () => {
    const mine = mintJoinClaim(PARTICIPANT, CONTEST, SECRET);
    const signature = mine.split(".")[2];
    const elsewhere = "clx0000000000000000000003";
    expect(readJoinClaim(`${PARTICIPANT}.${elsewhere}.${signature ?? ""}`, SECRET)).toBeNull();
  });

  it("rejects a claim signed with a different secret", () => {
    const forged = mintJoinClaim(PARTICIPANT, CONTEST, OTHER_SECRET);
    expect(readJoinClaim(forged, SECRET)).toBeNull();
  });

  /**
   * Every malformed shape must return null rather than throw. A cookie is attacker-controlled
   * input on every request, so a throw here is a 500 on the join page — which reads to a student
   * as the platform being broken.
   */
  it.each([
    "..",
    "a.b",
    "a.b.c.d",
    ".b.c",
    "a..c",
    "%%%",
    "a.b.",
  ])("returns null rather than throwing on %o", (raw) => {
    expect(() => readJoinClaim(raw, SECRET)).not.toThrow();
    expect(readJoinClaim(raw, SECRET)).toBeNull();
  });
});

describe("cookie attributes", () => {
  it("is httpOnly, lax, and Secure by default", () => {
    const options = joinClaimCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.secure).toBe(true);
  });

  it("takes secure from its argument, like the session cookie", () => {
    expect(joinClaimCookieOptions(false).secure).toBe(false);
  });

  /**
   * The claim must outlive the session, or the dropped-cookie rejoin it exists to permit stops
   * working exactly when a student needs it — twelve hours into a long night.
   */
  it("outlives the session it is not", () => {
    expect(JOIN_CLAIM_MAX_AGE_MS).toBeGreaterThan(SESSION_MAX_AGE_MS);
    expect(joinClaimCookieOptions().maxAge).toBe(Math.floor(JOIN_CLAIM_MAX_AGE_MS / 1000));
  });
});
