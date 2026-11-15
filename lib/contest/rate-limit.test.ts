import { describe, expect, it } from "vitest";

import { DomainError } from "@/lib/errors";
import {
  CredentialBackoff,
  RUN_SAMPLES_RULE,
  RateLimiter,
  SUBMIT_RULE,
  clientKey,
  hasTrustedProxy,
} from "@/lib/contest/rate-limit";

const START = new Date("2026-07-29T19:00:00.000Z");

function at(msFromStart: number): Date {
  return new Date(START.getTime() + msFromStart);
}

describe("RateLimiter", () => {
  it("allows up to the limit inside a window", () => {
    const limiter = new RateLimiter({ limit: 3, windowMs: 1000 });
    expect([0, 1, 2].map((i) => limiter.tryConsume("p-1", at(i)))).toEqual([true, true, true]);
    expect(limiter.tryConsume("p-1", at(3))).toBe(false);
  });

  it("starts a fresh window once the old one elapses", () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.tryConsume("p-1", at(0))).toBe(true);
    expect(limiter.tryConsume("p-1", at(999))).toBe(false);
    expect(limiter.tryConsume("p-1", at(1000))).toBe(true);
  });

  it("counts each key separately, so one student cannot throttle another", () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.tryConsume("p-1", at(0))).toBe(true);
    expect(limiter.tryConsume("p-2", at(0))).toBe(true);
  });

  it("throws a rate-limited domain error, which the edge maps to 429", () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000 });
    limiter.consumeOrThrow("p-1", at(0), "slow down");

    expect(() => limiter.consumeOrThrow("p-1", at(1), "slow down")).toThrow(DomainError);
    try {
      limiter.consumeOrThrow("p-1", at(1), "slow down");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("RATE_LIMITED");
    }
  });
});

/**
 * The join limiter is only safe where `clientKey` can tell clients apart.
 *
 * Wired unconditionally it refused three G9 specs inside `npm run verify`, because G7's joins had
 * already spent the single shared bucket. On a classroom LAN that is forty students unable to join
 * two minutes before the round — the exact outcome the original "joins are not rate limited"
 * comment was protecting, and a worse one than the abuse the limit prevents.
 */
describe("hasTrustedProxy", () => {
  /** Next augments ProcessEnv with a required NODE_ENV; these readers must not depend on it. */
  const env = (values: Record<string, string>): NodeJS.ProcessEnv =>
    values as unknown as NodeJS.ProcessEnv;

  it("is false with no proxy configured, where clientKey is a constant", () => {
    expect(hasTrustedProxy(env({}))).toBe(false);
    expect(hasTrustedProxy(env({ TRUSTED_PROXY_COUNT: "0" }))).toBe(false);
  });

  it("is true behind Caddy, which is what docker-compose.prod.yml configures", () => {
    expect(hasTrustedProxy(env({ TRUSTED_PROXY_COUNT: "1" }))).toBe(true);
  });

  it("is false for a malformed value rather than trusting it", () => {
    // The safe direction: a typo must not silently enable per-IP limiting keyed on a header the
    // client controls.
    expect(hasTrustedProxy(env({ TRUSTED_PROXY_COUNT: "many" }))).toBe(false);
    expect(hasTrustedProxy(env({ TRUSTED_PROXY_COUNT: "" }))).toBe(false);
  });

  it("agrees with clientKey about whether identity is available", () => {
    /**
     * The shape Caddy produces: whatever the CLIENT sent, with the real peer address appended.
     * The left-hand entry is therefore attacker-controlled and the right-hand one is not, which
     * is why `clientKey` counts from the right.
     */
    const SPOOFED_BY_CLIENT = "203.0.113.7";
    const APPENDED_BY_CADDY = "198.51.100.9";
    const request = new Request("http://x.test", {
      headers: { "x-forwarded-for": `${SPOOFED_BY_CLIENT}, ${APPENDED_BY_CADDY}` },
    });

    // No proxy: one bucket for everybody, so a per-client limit must not be enforced.
    expect(hasTrustedProxy(env({}))).toBe(false);
    expect(clientKey(request, env({}))).toBe("direct");

    // One proxy: a real per-client key, and it is the one the PROXY wrote — never the value the
    // client chose, or every bucket would be forgeable per request (SECURITY.md H4).
    const behindCaddy = env({ TRUSTED_PROXY_COUNT: "1" });
    expect(hasTrustedProxy(behindCaddy)).toBe(true);
    expect(clientKey(request, behindCaddy)).toBe(APPENDED_BY_CADDY);
    expect(clientKey(request, behindCaddy)).not.toBe(SPOOFED_BY_CLIENT);
  });
});

/*
  Coding Night: up to fifty students behind ONE school address, all submitting in the last ten
  seconds. The student-path limiters are keyed by participant, never by client address, so the
  shared NAT is invisible to them. If a future change re-keys one of them by `clientKey`, this is
  the arithmetic it has to survive.
*/
describe("fifty students behind one NAT", () => {
  const STUDENTS = Array.from({ length: 50 }, (_, index) => `participant-${String(index)}`);

  it("lets every student submit inside ten seconds", () => {
    const limiter = new RateLimiter(SUBMIT_RULE);
    const allowed = STUDENTS.map((id, index) => limiter.tryConsume(id, at(index * 200)));
    expect(allowed.every(Boolean)).toBe(true);
  });

  it("lets every student run samples twice and then submit twice in the last minute", () => {
    const samples = new RateLimiter(RUN_SAMPLES_RULE);
    const submits = new RateLimiter(SUBMIT_RULE);
    for (const id of STUDENTS) {
      expect([samples.tryConsume(id, at(0)), samples.tryConsume(id, at(1_000))]).toEqual([true, true]);
      expect([submits.tryConsume(id, at(2_000)), submits.tryConsume(id, at(50_000))]).toEqual([
        true,
        true,
      ]);
    }
  });

  it("would refuse a single shared bucket, which is why nothing on the student path uses one", () => {
    const shared = new RateLimiter(SUBMIT_RULE);
    const allowed = STUDENTS.filter((_, index) => shared.tryConsume("203.0.113.7", at(index * 200)));
    expect(allowed.length).toBe(SUBMIT_RULE.limit);
  });

  it("delays wrong join codes but never refuses one, and a right code clears the delay", () => {
    const backoff = new CredentialBackoff();
    for (let typo = 0; typo < 50; typo += 1) backoff.recordFailure();
    expect(backoff.delayMs()).toBe(5_000);
    backoff.recordSuccess();
    expect(backoff.delayMs()).toBe(0);
  });
});
