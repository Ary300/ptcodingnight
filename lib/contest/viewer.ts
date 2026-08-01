import { ForbiddenError } from "@/lib/errors";
import { SESSION_COOKIE, parseCookieHeader } from "@/lib/contest/session";
import { loadSession, touchSession, type LoadedSession } from "@/lib/contest/session-store";

/**
 * Who is calling.
 *
 * Three roles, three different reads (docs/PRD.md §4). Every route resolves a `Viewer` first
 * and then asks for what it needs — `requireAdmin`, `requireCompetitor` — so that a route
 * cannot accidentally serve a competitor payload to an anonymous projector by forgetting a
 * check. Assume every route is called directly with a forged role.
 */

export interface AnonymousViewer {
  readonly kind: "anonymous";
}

export interface CompetitorViewer {
  readonly kind: "competitor";
  readonly participantId: string;
  readonly contestId: string;
  readonly displayName: string;
  readonly sessionId: string;
  /**
   * The account behind this session, when there is one. NULL for a join-by-code competitor, who
   * has a display name but no `User` row and therefore no profile to edit. Settings is gated on
   * this being present.
   */
  readonly userId: string | null;
}

export interface AdminViewer {
  readonly kind: "admin";
  readonly displayName: string;
  readonly sessionId: string;
  /** An organizer always signs in through a `User` account, so this is never null for them. */
  readonly userId: string | null;
}

export type Viewer = AnonymousViewer | CompetitorViewer | AdminViewer;

export const ANONYMOUS: AnonymousViewer = { kind: "anonymous" };

/**
 * Turn a loaded session row into a viewer.
 *
 * A COMPETITOR session missing its participant or contest id is treated as anonymous rather
 * than as a competitor with holes in it: a half-populated session is exactly the shape a
 * corrupted or hand-edited row would have, and defaulting to "less access" is the only safe
 * direction to be wrong in.
 *
 * Kept as a pure function so the role mapping is unit-testable without a database.
 */
export function viewerFromSession(session: LoadedSession | null): Viewer {
  if (session === null) return ANONYMOUS;

  if (session.role === "ADMIN") {
    return {
      kind: "admin",
      displayName: session.displayName,
      sessionId: session.id,
      userId: session.userId,
    };
  }

  if (session.participantId === null || session.contestId === null) return ANONYMOUS;

  return {
    kind: "competitor",
    participantId: session.participantId,
    contestId: session.contestId,
    displayName: session.displayName,
    sessionId: session.id,
    userId: session.userId,
  };
}

/**
 * Resolve the caller from the request's cookie.
 *
 * Async because the session lives in Postgres rather than in the cookie — which is what makes
 * mid-contest revocation possible. A revoked session is refused on the very next request.
 */
export async function viewerFromRequest(
  request: Request,
  now: Date = new Date(),
): Promise<Viewer> {
  const token = parseCookieHeader(request.headers.get("cookie"))[SESSION_COOKIE];
  if (token === undefined) return ANONYMOUS;

  const session = await loadSession(token, now);
  if (session === null) return ANONYMOUS;

  // Bookkeeping only, deliberately not awaited. See touchSession.
  touchSession(session.id, now);

  return viewerFromSession(session);
}

/**
 * Resolve the caller inside a SERVER COMPONENT, where there is no `Request` to read.
 *
 * Same session lookup, different door. `viewerFromRequest` takes the header off a route handler's
 * request; a layout or a page gets its cookies from `next/headers` instead. Both end at
 * `loadSession`, so a revoked session is refused on the next render exactly as it is on the next
 * API call — the point of keeping sessions in Postgres.
 *
 * This exists because the organizer console had no server-side gate at all. Its API routes each
 * called `requireAdmin`, so no data leaked, but the SCREENS rendered for anybody who typed
 * `/admin`: the full nav, the section cards, and the fixture problem titles. What a visitor saw
 * was an organizer console with one failed panel on it, which is both a bad first impression and
 * an invitation to keep pulling at the door.
 */
export async function viewerFromCookies(now: Date = new Date()): Promise<Viewer> {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token === undefined) return ANONYMOUS;

  const session = await loadSession(token, now);
  if (session === null) return ANONYMOUS;

  touchSession(session.id, now);
  return viewerFromSession(session);
}

export function isAdmin(viewer: Viewer): viewer is AdminViewer {
  return viewer.kind === "admin";
}

export function requireAdmin(viewer: Viewer): AdminViewer {
  if (viewer.kind !== "admin") throw new ForbiddenError("Organizer access required");
  return viewer;
}

export function requireCompetitor(viewer: Viewer): CompetitorViewer {
  if (viewer.kind !== "competitor") throw new ForbiddenError("Join the contest first");
  return viewer;
}

/**
 * The `User` account behind the session, for the profile routes.
 *
 * Either role can edit their own profile, so this does not care whether the viewer is a competitor
 * or an organizer, only that a `User` is behind the session. A join-by-code competitor has a
 * display name but no account, so there is nothing to persist a change to and Settings is refused
 * with a message rather than silently doing nothing.
 */
export function requireAccountUserId(viewer: Viewer): string {
  if ((viewer.kind === "competitor" || viewer.kind === "admin") && viewer.userId !== null) {
    return viewer.userId;
  }
  throw new ForbiddenError("Sign in with a Google, GitHub or organizer account to change your profile");
}

/**
 * A competitor session is scoped to the contest it joined. Carrying it to another contest is
 * refused rather than quietly re-scoped.
 */
export function requireCompetitorOf(viewer: Viewer, contestId: string): CompetitorViewer {
  const competitor = requireCompetitor(viewer);
  if (competitor.contestId !== contestId) {
    throw new ForbiddenError("Your session belongs to a different contest");
  }
  return competitor;
}

/**
 * Reading somebody else's submission is an admin action. A spectator must not be able to walk
 * from the standings board — which publishes `participantId` — to a submission.
 */
export function canReadSubmission(viewer: Viewer, ownerParticipantId: string): boolean {
  if (viewer.kind === "admin") return true;
  return viewer.kind === "competitor" && viewer.participantId === ownerParticipantId;
}

/** What goes in `AuditLog.actor`. Never a secret, always enough to identify the actor later. */
export function actorLabel(viewer: Viewer): string {
  switch (viewer.kind) {
    case "admin":
      return `admin:${viewer.sessionId}`;
    case "competitor":
      return `participant:${viewer.participantId}`;
    case "anonymous":
      return "anonymous";
  }
}
