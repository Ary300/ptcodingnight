import { ForbiddenError } from "@/lib/errors";
import {
  SESSION_COOKIE,
  parseCookieHeader,
  verifySession,
  type SessionClaims,
} from "@/lib/contest/session";
import { sessionSecret } from "@/lib/contest/env";

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
 * Turn verified claims into a viewer.
 *
 * A COMPETITOR token missing its participant or contest id is treated as anonymous rather
 * than as a competitor with holes in it: a half-populated session is exactly the shape a
 * forged one would have.
 */
export function viewerFromClaims(claims: SessionClaims | null): Viewer {
  if (claims === null) return ANONYMOUS;

  if (claims.role === "ADMIN") {
    return { kind: "admin", displayName: claims.displayName, sessionId: claims.sid };
  }

  if (claims.participantId === null || claims.contestId === null) return ANONYMOUS;

  return {
    kind: "competitor",
    participantId: claims.participantId,
    contestId: claims.contestId,
    displayName: claims.displayName,
    sessionId: claims.sid,
  };
}

export function viewerFromRequest(request: Request, now: Date = new Date()): Viewer {
  const token = parseCookieHeader(request.headers.get("cookie"))[SESSION_COOKIE];
  if (token === undefined) return ANONYMOUS;
  return viewerFromClaims(verifySession(token, sessionSecret(), { now }));
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
