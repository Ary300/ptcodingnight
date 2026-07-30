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

/**
 * Email-and-password sign-in, in its OWN bucket — deliberately not sharing the passcode's.
 *
 * Sharing them looks tidy and is wrong. The passcode is the operational fallback that has to work on
 * the night, so an organizer who mistypes their password ten times must not thereby lose access to
 * it. One bucket inverts the entire point of having a fallback.
 *
 * Keyed by client rather than by email. Keying by email would let anyone lock a NAMED organizer out
 * by hammering their address — an account-lockout denial of service against the person most needed
 * during a contest. Keyed by client, an attacker can only exhaust their own budget.
 */
export const PASSWORD_LOGIN_RULE: RateLimitRule = { limit: 10, windowMs: 300_000 };

/**
 * SUCCESSFUL joins per client. Sized for a NAT, not for a person.
 *
 * A successful join was unlimited, and that is the amplifier for everything downstream: each new
 * participant is a fresh submission budget, a fresh run-samples budget, a row on the public board
 * and an audit row. A script with a valid code and a fresh cookie jar per request creates
 * hundreds, and on a 2 vCPU box shared with Postgres the judge queue never drains again.
 *
 * **Sixty, not fifteen, and the reason is a school network.** A classroom NATs to one public
 * address, so every student in the room shares this bucket — the failure mode of a tight limit is
 * that most of the room cannot join two minutes before the round, which is worse than the abuse
 * it prevents. Forty students joining once each fits inside sixty with room for retries; a script
 * gets sixty instead of unlimited, a twentyfold reduction.
 *
 * This bounds the RATE, not the total. The per-browser control is the join claim
 * (`lib/contest/join-claim.ts`), which is what stops one student accumulating participants.
 */
export const JOIN_RULE: RateLimitRule = { limit: 60, windowMs: 300_000 };

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
export const passwordLoginLimiter = new RateLimiter(PASSWORD_LOGIN_RULE);
export const joinLimiter = new RateLimiter(JOIN_RULE);

/**
 * Client identity for rate limiting.
 *
 * ## `x-forwarded-for` is NOT trusted by default, and that is a fix
 *
 * This used to read `x-forwarded-for` unconditionally, justified by "behind the LAN's single
 * reverse proxy". **There is no reverse proxy in the shipped deployment** — `docker-compose.yml`
 * publishes the web service directly and there is no middleware — so the header was simply
 * attacker-controlled input, and every limiter in this file could be defeated with:
 *
 *     curl -H "X-Forwarded-For: 10.0.$RANDOM.$RANDOM" ... /api/admin/session
 *
 * Each request landed in a fresh bucket, so the organizer passcode — a human-chosen shared secret
 * whose only protection is this limiter — could be brute-forced without limit.
 *
 * The header is now honoured **only** when `TRUSTED_PROXY_COUNT` says a proxy is actually in front,
 * and even then the value is taken from the right-hand end (the entry the nearest trusted proxy
 * appended), not the left-hand end that the client controls.
 */
/**
 * Whether `clientKey` can actually tell two clients apart.
 *
 * Without a trusted proxy it cannot: Next does not expose the socket address on `Request`, so
 * `clientKey` returns the constant `"direct"` and every caller shares one bucket. **A per-client
 * limit keyed on a constant is a room-wide denial of service** — which is exactly what happened
 * when the join limiter was first wired up: `npm run verify` ran G7 and then G9, their joins
 * shared the single bucket, and the last three a11y specs were refused. In a classroom that is
 * forty students unable to join two minutes before the round.
 *
 * So limits that are only safe when keyed per client are enforced only when they can be.
 * `docker-compose.prod.yml` sets `TRUSTED_PROXY_COUNT=1` because Caddy is in front, which is the
 * deployment exposed to the internet and the one that needs them.
 */
export function hasTrustedProxy(source: NodeJS.ProcessEnv = process.env): boolean {
  const hops = Number.parseInt(source.TRUSTED_PROXY_COUNT ?? "0", 10);
  return Number.isInteger(hops) && hops > 0;
}

export function clientKey(request: Request, source: NodeJS.ProcessEnv = process.env): string {
  const trustedHops = Number.parseInt(source.TRUSTED_PROXY_COUNT ?? "0", 10);

  if (Number.isInteger(trustedHops) && trustedHops > 0) {
    const chain = (request.headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");

    // Count from the RIGHT. The left-hand entries were supplied by the client; the rightmost
    // `trustedHops` were appended by proxies we control, so the one just left of them is the
    // earliest address we have any reason to believe.
    const index = chain.length - trustedHops;
    const candidate = index >= 0 ? chain[index] : chain[0];
    if (candidate !== undefined && candidate !== "") return candidate;
  }

  // No trusted proxy: the only identity worth anything is one the caller cannot set. Next.js does
  // not expose the socket address on `Request`, so this falls back to a single shared bucket —
  // which is deliberately CONSERVATIVE. Everyone shares one budget, which can slow legitimate use
  // on a busy LAN, and that is the correct direction to be wrong in for a brute-force control.
  return "direct";
}


/* ------------------------------------------------------------------------ */
/* Credential backoff                                                        */
/* ------------------------------------------------------------------------ */

/**
 * Slows credential guessing **without ever locking anybody out**.
 *
 * A counter-based limiter cannot work here now that `clientKey` refuses to trust a spoofable
 * header. The options were both bad:
 *
 *   per-IP from `x-forwarded-for`  — attacker-controlled, so no protection at all (the bug fixed
 *                                    above).
 *   one shared bucket, hard refusal — a student could burn the organizer's ten attempts on purpose
 *                                    and lock the console for five minutes, mid-contest.
 *
 * So this adds **delay** rather than refusal. After a few consecutive failures every attempt waits,
 * growing to a cap. Brute force dies — a few thousand guesses per hour instead of unlimited — while
 * an organizer who mistypes twice waits under a second and is never shut out.
 *
 * State is per-process and in memory. On a restart the counter resets, which is fine: the goal is
 * to make guessing slow, not to keep a permanent ledger.
 */
export class CredentialBackoff {
  private failures = 0;
  private readonly freeAttempts: number;
  private readonly stepMs: number;
  private readonly capMs: number;

  constructor(options: { freeAttempts?: number; stepMs?: number; capMs?: number } = {}) {
    this.freeAttempts = options.freeAttempts ?? 3;
    this.stepMs = options.stepMs ?? 400;
    this.capMs = options.capMs ?? 5_000;
  }

  /** How long the next attempt should wait. Exposed for tests; `throttle` is what routes call. */
  delayMs(): number {
    const over = this.failures - this.freeAttempts;
    if (over <= 0) return 0;
    return Math.min(this.capMs, over * this.stepMs);
  }

  /** Await before checking a credential. */
  async throttle(): Promise<void> {
    const delay = this.delayMs();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }

  recordFailure(): void {
    // Bounded so the counter cannot grow without limit under a sustained flood.
    this.failures = Math.min(this.failures + 1, 10_000);
  }

  /** A correct credential clears the penalty, so one attacker cannot tax an organizer forever. */
  recordSuccess(): void {
    this.failures = 0;
  }

  /** Test seam. */
  reset(): void {
    this.failures = 0;
  }
}

/**
 * The organizer passcode's backoff.
 *
 * **Its own instance.** This was one shared object while three separate comments — including this
 * file's, the password route's, and SECURITY.md H4 — asserted the two were deliberately kept
 * apart. They were not. Sharing it means an attacker hammering `/api/auth/password` adds up to
 * five seconds to every organizer passcode attempt, mid-contest, which is a smaller version of
 * exactly the lockout the delay design exists to avoid.
 */
export const credentialBackoff = new CredentialBackoff();

/** Email/password sign-in's backoff. Separate from the passcode's, as documented. */
export const passwordBackoff = new CredentialBackoff();

/**
 * A bound on how many expensive operations run AT ONCE, with a bounded queue.
 *
 * `CredentialBackoff` delays; it does not refuse, and a delay is not a resource bound. Password
 * verification is a deliberate 32 MB, ~50–100 ms scrypt that runs even for an address that does
 * not exist (the dummy-hash path that closes the timing oracle). So an unauthenticated flood
 *
 *   while :; do curl -X POST .../api/auth/password -d '{"email":"a@b.co","password":"x"}' & done
 *
 * has every request sleep in PARALLEL and then pile onto the libuv threadpool. On a 2 vCPU box
 * with a 768 MB container that is the join page, the problem pages and the projector board gone —
 * no credential and no join code required.
 *
 * A refusal here is not the lockout the backoff design rejects. That objection is about a
 * PER-ACCOUNT budget an attacker can exhaust on the organizer's behalf; this is transient
 * overload shedding that clears in milliseconds, and it protects the organizer's own sign-in by
 * keeping the process alive.
 */
export class ConcurrencyLimiter {
  private active = 0;
  private queued = 0;

  constructor(
    private readonly maxActive: number,
    private readonly maxQueued: number,
  ) {}

  /**
   * Run `work` inside the bound, or throw `RATE_LIMITED` if the queue is already full.
   *
   * The queue exists so a burst of legitimate sign-ins waits rather than fails; the cap on it is
   * what stops the queue itself becoming the memory leak.
   */
  async run<T>(work: () => Promise<T>, message: string): Promise<T> {
    if (this.queued >= this.maxQueued) {
      throw new DomainError("RATE_LIMITED", message);
    }

    this.queued += 1;
    try {
      while (this.active >= this.maxActive) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      this.active += 1;
    } finally {
      this.queued -= 1;
    }

    try {
      return await work();
    } finally {
      this.active -= 1;
    }
  }

  /** Test seam. */
  reset(): void {
    this.active = 0;
    this.queued = 0;
  }
}

/**
 * Four concurrent, sixty-four waiting.
 *
 * Four matches Node's default libuv threadpool, which is what actually executes scrypt — more
 * concurrency buys nothing and costs 32 MB each. Sixty-four waiting is far more than a school
 * contest signs in at once and is bounded, so the queue cannot itself exhaust the box.
 */
export const passwordWork = new ConcurrencyLimiter(4, 64);

/**
 * Wrong join codes only.
 *
 * A SUCCESSFUL join never consumes this, which is the point: forty students joining in two minutes
 * is the normal case and must not be throttled, while somebody guessing codes hits it immediately.
 */
export const JOIN_FAILURE_RULE: RateLimitRule = { limit: 20, windowMs: 300_000 };
export const joinFailureLimiter = new RateLimiter(JOIN_FAILURE_RULE);
