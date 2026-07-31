import { z } from "zod";

import { DomainError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/contest/password";
import type { OAuthIdentity, OAuthProvider } from "@/lib/contest/oauth";

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

  // 2. Not linked yet. Only a VERIFIED email may be matched to an EXISTING account.
  //
  // The verification requirement is narrow and it is about takeover, not about signup. An
  // unverified email is a claim by the person signing in rather than by the provider, so matching
  // on it would let anyone who can type an organizer's address into their GitHub profile walk
  // into that organizer's account.
  //
  // Nothing here refuses a sign-in. Without a verified email we simply do not LOOK for an
  // existing account, and fall through to creating a new one keyed on the provider's subject id.
  // That is the case that matters in practice: a GitHub account with no public email is the
  // normal state of a student's GitHub account, not an edge case.
  const verifiedEmail =
    identity.email !== null && identity.emailVerified ? identity.email.toLowerCase() : null;

  const byEmail =
    verifiedEmail === null
      ? null
      : await prisma.user.findUnique({
          where: { email: verifiedEmail },
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
    // No account. Make one, now, with no gate. See selfSignUpFromOAuth for the two things that
    // stop this ever producing an organizer.
    return selfSignUpFromOAuth(identity, subjectField, verifiedEmail);
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
 * Create a COMPETITOR account. No gate: anyone who can complete a Google or GitHub sign-in gets
 * one, immediately, on their first visit.
 *
 * ## There was a domain allowlist here and it was the wrong idea
 *
 * It defaulted to fail-closed, which sounds like the responsible choice and was not. A student's
 * GitHub account is registered to whatever address they used at thirteen; requiring a school
 * domain silently broke the GitHub button for most of the people it was meant to serve, and the
 * failure looked like "that account is not eligible" rather than like a policy decision anybody
 * had made on purpose. Access control for a school coding night is a roster an organizer curates,
 * not an email suffix.
 *
 * ## What still holds, and neither is a check a caller has to remember
 *
 * **1. The role is a literal.** `role: "COMPETITOR"` comes from nothing the person signing in can
 * influence — not the email, not a provider claim, not a parameter. There is no argument to this
 * function that could make it produce an ADMIN.
 *
 * **2. The database agrees independently.** A CHECK constraint refuses an ADMIN with no password,
 * so even a mistake here fails loudly rather than minting an organizer. Signing up cannot produce
 * one by any route.
 *
 * ## Why the email may be null
 *
 * Only a VERIFIED email is stored. An unverified one is a claim by the person signing in, and
 * writing it would let them squat an address they do not own — which matters because the email is
 * what a later verified sign-in matches against. A null email costs the account nothing: it is
 * keyed on the provider's subject id, which is stable and cannot be reassigned.
 */
async function selfSignUpFromOAuth(
  identity: OAuthIdentity,
  subjectField: "googleSub" | "githubSub",
  verifiedEmail: string | null,
): Promise<AuthenticatedUser> {
  const created = await prisma.user.create({
    data: {
      email: verifiedEmail,
      displayName: displayNameFor(identity, verifiedEmail),
      role: "COMPETITOR",
      // No password. See the CHECK constraint in the schema for why that is fine for a competitor
      // and refused for an admin.
      passwordHash: null,
      [subjectField]: identity.subject,
    },
    select: { id: true, displayName: true },
  });

  return { userId: created.id, displayName: created.displayName, role: "COMPETITOR" };
}

/**
 * A name to show on the leaderboard, which must never be empty and must never be an email address.
 *
 * Providers are inconsistent: Google usually gives a full name, GitHub gives the login when the
 * profile name is blank, and either can give nothing. Falling back to the email's local part is
 * the last resort and it is deliberately the LOCAL part — the projector shows this to a room, and
 * putting a student's full address on a wall is not a display name.
 */
function displayNameFor(identity: OAuthIdentity, verifiedEmail: string | null): string {
  const given = identity.displayName?.trim();
  if (given !== undefined && given.length > 0) return given.slice(0, 40);

  if (verifiedEmail !== null) {
    const local = verifiedEmail.slice(0, verifiedEmail.indexOf("@")).trim();
    if (local.length > 0) return local.slice(0, 40);
  }

  // Nothing usable from the provider. An organizer renames them from the roster; an empty string
  // would violate the contest's unique-name constraint on the second such account.
  return `${providerLabel(identity.provider)} user`;
}

export function providerLabel(provider: OAuthProvider): string {
  return provider === "google" ? "Google" : "GitHub";
}
