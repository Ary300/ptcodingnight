import { describe, expect, it } from "vitest";

import { emailMayCreateAccount, parseAllowedDomains } from "./signup-domains";

describe("parseAllowedDomains", () => {
  it("is empty when unset, so self-signup is off by default", () => {
    expect(parseAllowedDomains(undefined)).toEqual([]);
  });

  it("is empty for a blank or comma-only value", () => {
    expect(parseAllowedDomains("")).toEqual([]);
    expect(parseAllowedDomains("  ,  , ")).toEqual([]);
  });

  it("splits, trims, lowercases and drops a leading @", () => {
    expect(parseAllowedDomains(" @ParkTudor.org , students.parktudor.org ")).toEqual([
      "parktudor.org",
      "students.parktudor.org",
    ]);
  });

  it("DROPS an entry with no interior dot, which would widen the allowlist enormously", () => {
    // "com" would admit every .com address on the internet.
    expect(parseAllowedDomains("com")).toEqual([]);
    expect(parseAllowedDomains("parktudor.org,com,@")).toEqual(["parktudor.org"]);
  });
});

describe("emailMayCreateAccount", () => {
  const allowed = parseAllowedDomains("parktudor.org");

  it("refuses everything when nothing is configured", () => {
    expect(emailMayCreateAccount("alice@parktudor.org", [])).toBe(false);
  });

  it("admits an exact domain match, case-insensitively", () => {
    expect(emailMayCreateAccount("alice@parktudor.org", allowed)).toBe(true);
    expect(emailMayCreateAccount("Alice@ParkTudor.ORG", allowed)).toBe(true);
  });

  it("admits a subdomain", () => {
    expect(emailMayCreateAccount("alice@students.parktudor.org", allowed)).toBe(true);
  });

  it("REFUSES a domain that merely ends with the allowed one", () => {
    // The bug a naive endsWith() ships, and the reason this is a function.
    expect(emailMayCreateAccount("attacker@notparktudor.org", allowed)).toBe(false);
    expect(emailMayCreateAccount("attacker@evil-parktudor.org", allowed)).toBe(false);
  });

  it("refuses an unrelated domain", () => {
    expect(emailMayCreateAccount("someone@gmail.com", allowed)).toBe(false);
  });

  it("refuses malformed input rather than guessing", () => {
    expect(emailMayCreateAccount("no-at-sign", allowed)).toBe(false);
    expect(emailMayCreateAccount("trailing@", allowed)).toBe(false);
    expect(emailMayCreateAccount("", allowed)).toBe(false);
  });

  it("uses the LAST @, so an address cannot smuggle a domain in its local part", () => {
    expect(emailMayCreateAccount("alice@parktudor.org@gmail.com", allowed)).toBe(false);
    expect(emailMayCreateAccount("weird@name@parktudor.org", allowed)).toBe(true);
  });
});
