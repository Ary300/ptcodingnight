import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Promisified scrypt.
 *
 * Hand-wrapped rather than `promisify(scrypt)` because promisify resolves to the three-argument
 * overload and drops the options parameter — and the options are where N, r, p and maxmem live,
 * which is the entire point of using scrypt over a fixed-cost hash.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derived) => {
      if (err !== null) reject(err);
      else resolve(derived);
    });
  });
}

/**
 * Password hashing with scrypt.
 *
 * scrypt rather than bcrypt or argon2 because it is in Node's standard library. This platform has
 * to be runnable by a student maintainer years from now (PRD §3, S6), and a native dependency that
 * needs a compiler is exactly the kind of thing that stops working after a Node upgrade. scrypt is
 * memory-hard, which is the property that matters, and it is already here.
 *
 * ## Format
 *
 * `scrypt$N$r$p$saltB64$hashB64` — self-describing, so the cost parameters can be raised later
 * without invalidating existing hashes. A hash stored under the old parameters still verifies
 * against its own recorded ones.
 */

/**
 * Cost parameters. N is the memory/CPU factor.
 *
 * 2^15 = 32768 with r=8 costs roughly 32 MB and ~50-100 ms per hash on this class of machine.
 * Chosen against the actual threat: an organizer account guarded by a passphrase, on a server that
 * also has to judge 40 concurrent submissions. Raising N to 2^17 would be more secure and would
 * also let a handful of login attempts compete with the judge for memory on contest night.
 */
const PARAMS = { N: 32_768, r: 8, p: 1, keyLength: 64 } as const;

const SALT_BYTES = 16;

/** Hash a password for storage in `User.passwordHash`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, PARAMS.keyLength, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    // Node's default maxmem is 32 MB and N=32768 r=8 needs exactly that (128 * N * r), so the
    // default rejects it. OpenSSL also wants headroom above the theoretical minimum, hence the
    // factor of 2 rather than the exact figure — passing `128 * N * r` still throws
    // "memory limit exceeded".
    maxmem: 2 * 128 * PARAMS.N * PARAMS.r * PARAMS.p,
  });

  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Verify a password against a stored hash.
 *
 * Returns false for a malformed or unrecognised hash rather than throwing: a corrupted row must
 * mean "cannot sign in", not a 500 that reveals the row is corrupt.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;

  const [scheme, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  if (scheme !== "scrypt") return false;

  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (N <= 1 || r <= 0 || p <= 0) return false;
  // Refuse absurd parameters from a tampered row: a huge N would be a denial of service against
  // ourselves, performed on request by anyone who can reach the login form.
  if (N > 1 << 20 || r > 32 || p > 16) return false;

  if (saltB64 === undefined || hashB64 === undefined) return false;

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  let derived: Buffer;
  try {
    derived = await scrypt(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 2 * 128 * N * r * p,
    });
  } catch {
    return false;
  }

  // Lengths are equal by construction here, but timingSafeEqual throws on a mismatch and a throw
  // would turn a tampered row into a 500.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/**
 * Whether a stored hash was produced with weaker parameters than the current ones.
 *
 * Lets a successful sign-in transparently upgrade the hash. Not called on the contest-night path —
 * rehashing costs another scrypt — but useful when the cost parameters are raised.
 */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) < PARAMS.N || Number(parts[2]) < PARAMS.r;
}

/**
 * Minimum acceptable password.
 *
 * Length only, and no character-class rules. Composition rules push people toward `Passw0rd!` and
 * away from a long passphrase, which is the opposite of what helps. Twelve characters is the floor
 * for an organizer account that can override verdicts.
 */
export const MIN_PASSWORD_LENGTH = 12;

export function passwordComplaint(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters. A short phrase is fine and better than a short word.`;
  }
  return null;
}
