import type { OAuthProvider } from "@/lib/contest/oauth";

/**
 * The vocabulary `/sign-in?error=` speaks.
 *
 * ## Why this is a code and not a sentence
 *
 * Every failing sign-in path used to put its own PROSE in the query string and the page rendered
 * whatever arrived. React escapes it, so there was no XSS — but the text itself was the payload.
 * Anyone could send a student
 *
 *     https://ptcodingnight.com/sign-in?error=Your+account+is+locked.+Email+your+password+to+…
 *
 * and it rendered in the site's own error styling, on the site's own domain, above the site's own
 * sign-in form. That is a phishing page hosted by us, built out of one query parameter.
 *
 * Routing the reason through a fixed set of codes closes it structurally rather than by escaping:
 * the page can only ever render a string that is written down in this file, so an unrecognised
 * value degrades to the generic message instead of becoming one. The same property is what
 * guarantees the second rule in the brief — the banner can never show a raw exception or a stack,
 * because there is no path by which arbitrary text reaches it.
 *
 * The provider name is carried SEPARATELY, as `?provider=`, and is itself validated against the
 * two providers this server knows. It is a substitution into copy that lives here, not copy.
 *
 * ## One caller still sends prose, and it is outside this change
 *
 * `app/(admin)/layout.tsx` redirects an unsigned visitor with
 * `?error=Sign+in+as+an+organizer+to+open+the+console.` That now degrades to the `unknown`
 * sentence, which is true but vaguer than it was. The code it wants is `organizer_required`,
 * defined below and ready: the fix is one line,
 * `redirect(signInErrorLocation("organizer_required"))`.
 */

export const SIGN_IN_ERROR_CODES = [
  /** `oauthConfig()` returned null: no client id or secret for this provider on this host. */
  "provider_unconfigured",
  /** The path parameter was not `google` or `github`. */
  "provider_unknown",
  /** The provider reported `?error=` — declining at the consent screen is the common one. */
  "cancelled",
  /** The start route threw before it could redirect: a malformed PUBLIC_ORIGIN, an env that fails
   *  to parse. Always ours, never the student's. */
  "start_failed",
  /** No state cookie, a state that does not match, or a callback missing `code`/`state`. */
  "state",
  /** The server-to-server code exchange failed, or the identity came back unreadable. */
  "exchange",
  /** The account exists and an organizer has disabled it. */
  "account_disabled",
  /** This email already resolves to a DIFFERENT provider subject. A human has to look. */
  "account_linked_elsewhere",
  /** Signed in fine, but there is no DRAFT/SCHEDULED/RUNNING contest to be enrolled in. */
  "no_contest",
  /** Enrolment threw. Distinct from `no_contest`: this one is worth retrying. */
  "enrolment_failed",
  /** Something reached `/admin` without an organizer session. */
  "organizer_required",
  /** Our bug. Logged server-side with detail; the student gets a sentence. */
  "unknown",
] as const;

export type SignInErrorCode = (typeof SIGN_IN_ERROR_CODES)[number];

/**
 * The message a student reads.
 *
 * Every one of these names something the reader can DO next, because a sign-in error with no next
 * step is a dead end and the room has one organizer for forty students. Every message gives a
 * retry or a clear person to ask for help.
 */
const MESSAGES: Readonly<Record<SignInErrorCode, (provider: string) => string>> = {
  provider_unconfigured: (p) =>
    `${p} sign-in is not set up on this server. That is our configuration, not your account. ` +
    `Ask an organizer for help.`,
  provider_unknown: () =>
    "That is not a sign-in provider this server offers. Use an available option, or ask an " +
    "organizer to sign you in.",
  // Provider-initial on purpose: with `?provider=` absent the label degrades to "That provider",
  // and the old mid-sentence phrasing rendered "You cancelled the That provider sign-in".
  cancelled: (p) => `${p} sign-in was cancelled before it finished. Press the button to try again.`,
  start_failed: (p) =>
    `${p} sign-in could not be started. That is our configuration, not your account. An ` +
    `organizer can sign you in instead.`,
  state: () =>
    "That sign-in could not be verified. It may have been started in another tab, or left open " +
    "too long. Start again from this page and it will work.",
  exchange: (p) =>
    `${p} would not confirm who you are. Try again, and if it keeps happening use the other ` +
    `button or ask an organizer.`,
  account_disabled: () =>
    "That account has been turned off. An organizer can turn it back on for you.",
  account_linked_elsewhere: (p) =>
    `That email is already linked to a different ${p} account. An organizer has to unlink it ` +
    `before you can sign in this way.`,
  no_contest: () =>
    "Your account is ready, but there is no contest open right now, so there is nothing to " +
    "enrol you in. An organizer needs to open tonight's contest, then sign in again.",
  enrolment_failed: () =>
    "Your account is ready, but we could not add you to the contest just now. Try signing in " +
    "again in a moment.",
  organizer_required: () => "Sign in as an organizer to open the console.",
  unknown: () => "That sign-in did not finish. Try again, or ask an organizer to sign you in.",
};

function isSignInErrorCode(value: string): value is SignInErrorCode {
  return (SIGN_IN_ERROR_CODES as readonly string[]).includes(value);
}

/** The label substituted into the copy above. Never taken from the URL unvalidated. */
function labelFor(provider: string | null): string {
  if (provider === "google") return "Google";
  if (provider === "github") return "GitHub";
  // Every message that reads badly without a provider name is only ever produced by a route that
  // has one, so this is the shape of a hand-typed URL rather than of a real failure.
  return "That provider";
}

/**
 * Resolve `?error=` and `?provider=` to something to show, or null for "no error".
 *
 * An unrecognised code is NOT echoed. It falls back to `unknown`, which is the whole point: the
 * banner renders copy from this file or it renders nothing.
 */
export function signInErrorMessage(
  code: string | null | undefined,
  provider: string | null | undefined,
): string | null {
  if (code === null || code === undefined || code === "") return null;
  const resolved: SignInErrorCode = isSignInErrorCode(code) ? code : "unknown";
  return MESSAGES[resolved](labelFor(provider ?? null));
}

/**
 * Build the `Location` a failing sign-in redirects to.
 *
 * RELATIVE, always, and that is load-bearing rather than tidy. Rebuilding an absolute URL means
 * inventing a scheme and a host, and it invented the wrong ones: a sign-in on localhost ended at
 * `https://localhost:3000/…`, which nothing is listening on, so a callback that had actually
 * succeeded surfaced as "Safari can't open the page". A relative Location (RFC 7231 §7.1.2) is
 * resolved by the browser against the URL it is already on, so there is no configuration to get
 * wrong and nothing for a proxy to disagree with.
 */
export function signInErrorLocation(code: SignInErrorCode, provider?: OAuthProvider): string {
  const query = new URLSearchParams({ error: code });
  if (provider !== undefined) query.set("provider", provider);
  return `/sign-in?${query.toString()}`;
}
