import { describe, expect, it } from "vitest";

import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  needsRehash,
  passwordComplaint,
  verifyPassword,
} from "@/lib/contest/password";

/**
 * Password hashing.
 *
 * These are slower than the rest of the unit suite — that is the point of a memory-hard KDF — so
 * the number of hashes here is kept deliberately small.
 */

const GOOD = "a-long-enough-passphrase";

describe("hashPassword", () => {
  it("produces a self-describing hash", async () => {
    // Self-describing so the cost parameters can be raised later without invalidating hashes
    // already stored: each one verifies against its own recorded parameters.
    const hash = await hashPassword(GOOD);
    const parts = hash.split("$");

    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe("scrypt");
    expect(Number(parts[1])).toBeGreaterThanOrEqual(32_768);
  });

  it("never produces the same hash twice for the same password", async () => {
    // Per-password salt. Without it, two organizers choosing the same passphrase would be visibly
    // identical in the database.
    const [a, b] = await Promise.all([hashPassword(GOOD), hashPassword(GOOD)]);
    expect(a).not.toBe(b);
  });

  it("never contains the password", async () => {
    const hash = await hashPassword(GOOD);
    expect(hash).not.toContain(GOOD);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    const hash = await hashPassword(GOOD);

    expect(await verifyPassword(GOOD, hash)).toBe(true);
    expect(await verifyPassword("not-the-passphrase", hash)).toBe(false);
  });

  it("rejects a near-miss", async () => {
    const hash = await hashPassword(GOOD);
    expect(await verifyPassword(`${GOOD} `, hash)).toBe(false);
    expect(await verifyPassword(GOOD.toUpperCase(), hash)).toBe(false);
  });

  it("returns false rather than throwing for a malformed hash", async () => {
    // A corrupted row must mean "cannot sign in", not a 500 that advertises the row is corrupt.
    for (const bad of ["", "garbage", "scrypt$1$2$3", "bcrypt$1$8$1$aaaa$bbbb", "scrypt$$$$$"]) {
      expect(await verifyPassword(GOOD, bad), bad).toBe(false);
    }
  });

  it("refuses absurd cost parameters from a tampered row", async () => {
    // A huge N would be a denial of service against ourselves, triggered on demand by anyone who
    // can reach the login form.
    const absurd = `scrypt$${2 ** 25}$8$1$${Buffer.from("salt").toString("base64")}$${Buffer.from(
      "hash",
    ).toString("base64")}`;

    expect(await verifyPassword(GOOD, absurd)).toBe(false);
  });

  it("refuses a hash with an unknown scheme", async () => {
    const hash = await hashPassword(GOOD);
    const swapped = hash.replace(/^scrypt/, "md5");
    expect(await verifyPassword(GOOD, swapped)).toBe(false);
  });
});

describe("needsRehash", () => {
  it("is false for a hash at the current parameters", async () => {
    expect(needsRehash(await hashPassword(GOOD))).toBe(false);
  });

  it("is true for a weaker or unrecognised hash", () => {
    expect(needsRehash("scrypt$1024$8$1$c2FsdA==$aGFzaA==")).toBe(true);
    expect(needsRehash("garbage")).toBe(true);
  });
});

describe("passwordComplaint", () => {
  it("rejects a short password", () => {
    expect(passwordComplaint("short")).not.toBeNull();
    expect(passwordComplaint("x".repeat(MIN_PASSWORD_LENGTH - 1))).not.toBeNull();
  });

  it("accepts a long passphrase with no special characters", () => {
    // Length only, no composition rules. Character-class rules push people toward `Passw0rd!` and
    // away from a long passphrase, which is the opposite of what helps.
    expect(passwordComplaint("correct horse battery staple")).toBeNull();
  });
});
