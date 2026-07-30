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
}

export interface AdminViewer {
  readonly kind: "admin";
  readonly displayName: string;
  readonly sessionId: string;
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
    return { kind: "admin", displayName: session.displayName, sessionId: session.id };
  }

  if (session.participantId === null || session.contestId === null) return ANONYMOUS;

  return {
    kind: "competitor",
    participantId: session.participantId,
    contestId: session.contestId,
    displayName: session.displayName,
    sessionId: session.id,
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
