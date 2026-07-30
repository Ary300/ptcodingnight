import { z } from "zod";

import { DomainError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/contest/password";
import type { OAuthIdentity, OAuthProvider } from "@/lib/contest/oauth";

/**
 * Account resolution for all three sign-in providers.
 *
 * One rule governs this file: **OAuth links to accounts, it never creates them.** `User.passwordHash`
 * is NOT NULL in the schema, so an account reachable only through Google or GitHub is
 * unrepresentable — but the schema can only refuse the insert, not explain why, so the reasoning
 * lives here and the code path that would do it does not exist.
 *
 * Why, given that internet at the event is guaranteed (PRD §10.1): OAuth fails for reasons that
 * have nothing to do with the venue. An expired client secret, a changed consent screen, a student
 * without a school account. Every account keeps a way in that does not depend on a third party.
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
    // The invariant, stated to the person who hit it. No account is created here — not as a
    // convenience, not behind a flag.
    throw new DomainError(
      "UNAUTHORIZED",
      `There is no account for that ${providerLabel(identity.provider)} address. ` +
        "An organizer has to create it first. To compete now, use the contest join code.",
    );
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

export function providerLabel(provider: OAuthProvider): string {
  return provider === "google" ? "Google" : "GitHub";
}
