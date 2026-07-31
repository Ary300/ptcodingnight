import { z } from "zod";

import { DomainError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/contest/password";
import type { OAuthIdentity, OAuthProvider } from "@/lib/contest/oauth";
import { emailMayCreateAccount, parseAllowedDomains } from "@/lib/contest/signup-domains";

/**
 * Account resolution for all three sign-in providers.
 *
 * The rule that used to govern this file was "OAuth links to accounts, it never creates them".
 * Students now sign themselves up with Google or GitHub, so that is no longer true — and the rule
 * that replaces it is narrower and load-bearing:
 *
 *   **Signing in can create a COMPETITOR. Nothing here can ever produce an ADMIN.**
 *
 * `selfSignUpFromOAuth` writes `role: "COMPETITOR"` as a literal, with no argument that could
 * change it, and the database refuses an ADMIN with no password independently via a CHECK
 * constraint. Two mechanisms, neither relying on a caller remembering anything.
 *
 * Organizer accounts stay admin-issued, exactly as before: created with a password, and only then
 * linkable to a provider by verified email.
 */

export const EmailLoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("That does not look like an email address")),
  password: z.string().min(1, "Enter your password").max(400),
});
export type EmailLogin = z.infer<typeof EmailLoginSchema>;

export interface AuthenticatedUser {
  readonly userId: string;
  readonly displayName: string;
  readonly role: "COMPETITOR" | "ADMIN";
}

/**
 * Sign in with email and password.
 *
 * Failures are deliberately indistinguishable: no such email, wrong password, and disabled account
 * all produce the same message. Distinguishing them turns the login form into an account
 * enumerator, and "that email has no account here" is exactly what someone probing wants to know.
 *
 * The password is verified even when the email is unknown, against a dummy hash, so the response
 * time does not reveal whether the account exists.
 */
export async function authenticateWithPassword(input: EmailLogin): Promise<AuthenticatedUser> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, displayName: true, role: true, passwordHash: true, disabledAt: true },
  });

  const refuse = (): never => {
    throw new DomainError("UNAUTHORIZED", "That email and password do not match an account");
  };

  if (user === null) {
    // Constant-ish work for an unknown email. Without this, a fast rejection says "no such
    // account" as clearly as a message would.
    await verifyPassword(input.password, DUMMY_HASH);
    return refuse();
  }

  // A student who signed up with Google or GitHub has no password hash. They must not be able to
  // sign in here with anything — and must not be DISTINGUISHABLE from an unknown email either, so
  // the dummy verify runs before refusing, exactly as it does above. Skipping it would make a
  // passwordless account answer measurably faster than a real one, which is an account
  // enumerator built out of a stopwatch.
  if (user.passwordHash === null) {
    await verifyPassword(input.password, DUMMY_HASH);
    return refuse();
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) return refuse();
  if (user.disabledAt !== null) return refuse();

  return {
    userId: user.id,
    displayName: user.displayName,
    role: user.role === "ADMIN" ? "ADMIN" : "COMPETITOR",
  };
}

/**
 * A real scrypt hash of a random value, used only to burn comparable time on an unknown email.
 *
 * Hard-coded rather than generated at import: generating one would cost a hash on every cold start,
 * and it protects nothing — it is a hash of a value nobody knows and no account uses.
 */
const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

/**
 * Resolve an OAuth identity to an existing account, linking on first use.
 *
 * Throws rather than creating. The error names the fallback, because a student staring at "no
 * account" needs to know a join code will work.
 */
export async function linkedUserFor(identity: OAuthIdentity): Promise<AuthenticatedUser> {
  const subjectField = identity.provider === "google" ? "googleSub" : "githubSub";

  // 1. Already linked. The stable subject id is the only key trusted for this.
  const linked = await prisma.user.findFirst({
    where: { [subjectField]: identity.subject },
    select: { id: true, displayName: true, role: true, disabledAt: true },
  });

  if (linked !== null) {
    if (linked.disabledAt !== null) {
      throw new DomainError("UNAUTHORIZED", "That account has been disabled");
    }
    return {
      userId: linked.id,
      displayName: linked.displayName,
      role: linked.role === "ADMIN" ? "ADMIN" : "COMPETITOR",
    };
  }

  // 2. Not linked yet. Match an existing account by VERIFIED email only.
  //
  // Requiring verification is the whole security of this step. An unverified email is a claim by
  // the person signing in rather than by the provider, so matching on it would let anyone who can
  // set their profile email to an organizer's address take that organizer's account.
  if (identity.email === null || !identity.emailVerified) {
    throw new DomainError(
      "UNAUTHORIZED",
      `${providerLabel(identity.provider)} did not give us a verified email address, so we cannot ` +
        "match it to an account. Sign in with your email and password, or use a join code.",
    );
  }

  const byEmail = await prisma.user.findUnique({
    where: { email: identity.email.toLowerCase() },
    select: {
      id: true,
      displayName: true,
      role: true,
      disabledAt: true,
      googleSub: true,
      githubSub: true,
    },
  });

  if (byEmail === null) {
    // No account yet. This is where a student signs themselves up — if, and only if, their
    // verified email is on the allowlist. See selfSignUpFromOAuth for why the role is a literal.
    return selfSignUpFromOAuth(identity, subjectField);
  }

  if (byEmail.disabledAt !== null) {
    throw new DomainError("UNAUTHORIZED", "That account has been disabled");
  }

  // Refuse to move a link that already points somewhere else. Reaching here means the same email
  // now resolves to a different provider subject than the one already stored — a reassigned school
  // address, or an attempt to take over the account. Either way a human should look.
  const existingSubject = identity.provider === "google" ? byEmail.googleSub : byEmail.githubSub;
  if (existingSubject !== null && existingSubject !== identity.subject) {
    throw new DomainError(
      "UNAUTHORIZED",
      `That account is already linked to a different ${providerLabel(identity.provider)} account. ` +
        "An organizer needs to unlink it first.",
    );
  }

  await prisma.user.update({
    where: { id: byEmail.id },
    data: { [subjectField]: identity.subject },
  });

  return {
    userId: byEmail.id,
    displayName: byEmail.displayName,
    role: byEmail.role === "ADMIN" ? "ADMIN" : "COMPETITOR",
  };
}

/**
 * Create a COMPETITOR account for a verified email on the allowlist.
 *
 * ## The two things that make this safe, and neither is a check on the caller
 *
 * **1. The role is a literal.** `role: "COMPETITOR"` is written here and comes from nothing the
 * person signing in can influence — not the email, not a provider claim, not a query parameter,
 * not a mapping table. There is no argument to this function that could make it produce an ADMIN,
 * so no future caller can pass one. The database agrees independently: a CHECK constraint refuses
 * an ADMIN with no password, so even a mistake here fails loudly instead of minting an organizer.
 *
 * **2. The allowlist is fail-closed.** Unset means nobody may self-signup and the behaviour is
 * exactly what it was before this existed. `ptcodingnight.com` is on the open internet; an
 * allowlist that defaulted to "anyone with a Google account" would let strangers onto the
 * leaderboard with nothing written to any log.
 *
 * The email is already known to be VERIFIED by the caller — that check is what stops someone
 * setting their provider profile email to a school address and walking in.
 */
async function selfSignUpFromOAuth(
  identity: OAuthIdentity,
  subjectField: "googleSub" | "githubSub",
): Promise<AuthenticatedUser> {
  const email = identity.email?.toLowerCase() ?? null;
  const allowed = parseAllowedDomains(process.env.SIGNUP_ALLOWED_EMAIL_DOMAINS);

  if (email === null || !emailMayCreateAccount(email, allowed)) {
    // One message for "signup is switched off" and for "your domain is not on the list". The
    // difference is only interesting to someone probing for which domains are accepted.
    throw new DomainError(
      "UNAUTHORIZED",
      `That ${providerLabel(identity.provider)} account is not eligible to sign up here. ` +
        "Use your school account, or ask an organizer to create one for you.",
    );
  }

  const created = await prisma.user.create({
    data: {
      email,
      displayName: identity.displayName?.trim() ?? email.slice(0, email.indexOf("@")),
      role: "COMPETITOR",
      // No password. The account is reachable through this provider and through an
      // organizer-set password later; see the CHECK constraint in the schema for why that is
      // acceptable for a competitor and refused for an admin.
      passwordHash: null,
      [subjectField]: identity.subject,
    },
    select: { id: true, displayName: true },
  });

  return { userId: created.id, displayName: created.displayName, role: "COMPETITOR" };
}

export function providerLabel(provider: OAuthProvider): string {
  return provider === "google" ? "Google" : "GitHub";
}
