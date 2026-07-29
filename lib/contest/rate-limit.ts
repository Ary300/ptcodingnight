import { DomainError } from "@/lib/errors";

/**
 * A fixed-window rate limiter.
 *
 * Deliberately in-process and dependency-free. The night runs on a LAN with one web container
 * (docs/PRD.md §10), and a Redis round-trip on the submission path buys nothing at 40
 * concurrent students. What it protects against is a stuck retry loop in a browser tab
 * flooding the judge queue, not a determined attacker — say so rather than implying more.
 *
 * The clock is a parameter, so the behaviour is a unit test rather than a `setTimeout`.
 */

export interface RateLimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

/** Judged submissions. Generous enough that nobody legitimate hits it during a contest. */
export const SUBMIT_RULE: RateLimitRule = { limit: 12, windowMs: 60_000 };

/** "Run samples" is free to the student but not to the judge, so it is capped too. */
export const RUN_SAMPLES_RULE: RateLimitRule = { limit: 20, windowMs: 60_000 };

/** Failed admin logins. Slow down a passcode guess without locking an organizer out. */
export const ADMIN_LOGIN_RULE: RateLimitRule = { limit: 10, windowMs: 300_000 };

/** Join attempts per client. A join code is short; this is what stops it being guessed. */
export const JOIN_RULE: RateLimitRule = { limit: 15, windowMs: 300_000 };

interface Window {
  count: number;
  resetAtMs: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly rule: RateLimitRule) {}

  /** @returns true when the call is allowed; false when it exceeds the rule. */
  tryConsume(key: string, now: Date): boolean {
    const nowMs = now.getTime();
    const existing = this.windows.get(key);

    if (existing === undefined || nowMs >= existing.resetAtMs) {
      this.windows.set(key, { count: 1, resetAtMs: nowMs + this.rule.windowMs });
      this.sweep(nowMs);
      return true;
    }

    if (existing.count >= this.rule.limit) return false;

    existing.count += 1;
    return true;
  }

  consumeOrThrow(key: string, now: Date, message: string): void {
    if (!this.tryConsume(key, now)) throw new DomainError("RATE_LIMITED", message);
  }

  /** Drop expired windows so a long contest night does not grow the map without bound. */
  private sweep(nowMs: number): void {
    if (this.windows.size < 512) return;
    for (const [key, window] of this.windows) {
      if (nowMs >= window.resetAtMs) this.windows.delete(key);
    }
  }
}

export const submitLimiter = new RateLimiter(SUBMIT_RULE);
export const runSamplesLimiter = new RateLimiter(RUN_SAMPLES_RULE);
export const adminLoginLimiter = new RateLimiter(ADMIN_LOGIN_RULE);
export const joinLimiter = new RateLimiter(JOIN_RULE);

/**
 * Best-effort client identity for rate limiting.
 *
 * Behind the LAN's single reverse proxy `x-forwarded-for` is trustworthy enough for this
 * purpose; it is never used for authorization, only for slowing a flood down.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first !== undefined && first !== "") return first;
  return request.headers.get("x-real-ip") ?? "unknown";
}
