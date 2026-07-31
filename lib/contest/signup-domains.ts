/**
 * Who is allowed to create an account by signing in with Google or GitHub.
 *
 * Pure string work, kept out of the account code so it can be tested exhaustively without a
 * database — this is the check standing between a school contest and the open internet, and it is
 * the kind of thing that is wrong in a way nobody notices until it matters.
 *
 * ## Fail closed
 *
 * No configuration means no self-signup. Not "allow everyone": an allowlist that defaults to open
 * fails silently and publicly, and the symptom is strangers appearing on the leaderboard rather
 * than an error in a log.
 */

/** Parse the env value into normalised domains. Unset, blank, or all-junk yields an empty list. */
export function parseAllowedDomains(raw: string | undefined): readonly string[] {
  if (raw === undefined) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ""))
    // A bare "com" or a stray "@" would widen the allowlist far past what was meant, so anything
    // without an interior dot is dropped rather than accepted.
    .filter((entry) => entry.length > 0 && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(entry));
}

/**
 * Is this email allowed to create an account?
 *
 * Matches the domain exactly, or as a subdomain of an allowed domain — `parktudor.org` admits
 * `alice@students.parktudor.org`. The subdomain check is anchored on a leading dot so that
 * `notparktudor.org` does not match `parktudor.org`, which is the mistake a naive `endsWith`
 * makes and the reason this is a function rather than one line at the call site.
 */
export function emailMayCreateAccount(
  email: string,
  allowed: readonly string[],
): boolean {
  if (allowed.length === 0) return false;

  const at = email.lastIndexOf("@");
  if (at === -1 || at === email.length - 1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (domain.length === 0) return false;

  return allowed.some((entry) => domain === entry || domain.endsWith(`.${entry}`));
}
