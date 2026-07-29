import { describe, expect, it } from "vitest";

import { DomainError } from "@/lib/errors";
import { RateLimiter } from "@/lib/contest/rate-limit";

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
