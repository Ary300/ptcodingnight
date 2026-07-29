import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@/lib/errors";
import type { SessionClaims } from "@/lib/contest/session";
import {
  ANONYMOUS,
  actorLabel,
  canReadSubmission,
  requireAdmin,
  requireCompetitor,
  requireCompetitorOf,
  viewerFromClaims,
  type Viewer,
} from "@/lib/contest/viewer";

const competitorClaims: SessionClaims = {
  sid: "s-1",
  role: "COMPETITOR",
  participantId: "p-1",
  contestId: "c-1",
  displayName: "Ada",
  issuedAtMs: 0,
};

const adminClaims: SessionClaims = {
  sid: "s-2",
  role: "ADMIN",
  participantId: null,
  contestId: null,
  displayName: "Organizer",
  issuedAtMs: 0,
};

const competitor: Viewer = viewerFromClaims(competitorClaims);
const admin: Viewer = viewerFromClaims(adminClaims);

describe("viewerFromClaims", () => {
  it("maps a competitor session", () => {
    expect(competitor).toEqual({
      kind: "competitor",
      participantId: "p-1",
      contestId: "c-1",
      displayName: "Ada",
      sessionId: "s-1",
    });
  });

  it("maps an admin session", () => {
    expect(admin).toEqual({ kind: "admin", displayName: "Organizer", sessionId: "s-2" });
  });

  it("treats a half-populated competitor session as anonymous", () => {
    expect(viewerFromClaims({ ...competitorClaims, participantId: null })).toEqual(ANONYMOUS);
    expect(viewerFromClaims({ ...competitorClaims, contestId: null })).toEqual(ANONYMOUS);
  });

  it("treats no session as anonymous", () => {
    expect(viewerFromClaims(null)).toEqual(ANONYMOUS);
  });
});

describe("role requirements", () => {
  it("lets an admin through requireAdmin and refuses everyone else", () => {
    expect(requireAdmin(admin).kind).toBe("admin");
    expect(() => requireAdmin(competitor)).toThrow(ForbiddenError);
    expect(() => requireAdmin(ANONYMOUS)).toThrow(ForbiddenError);
  });

  it("refuses an admin on a competitor-only route", () => {
    expect(() => requireCompetitor(admin)).toThrow(ForbiddenError);
    expect(requireCompetitor(competitor).participantId).toBe("p-1");
  });

  it("refuses a competitor session carried to another contest", () => {
    expect(requireCompetitorOf(competitor, "c-1").contestId).toBe("c-1");
    expect(() => requireCompetitorOf(competitor, "c-2")).toThrow(ForbiddenError);
  });
});

describe("canReadSubmission", () => {
  it("allows the owner and an organizer only", () => {
    expect(canReadSubmission(competitor, "p-1")).toBe(true);
    expect(canReadSubmission(admin, "p-1")).toBe(true);
  });

  it("refuses another competitor and a spectator", () => {
    expect(canReadSubmission(competitor, "p-2")).toBe(false);
    expect(canReadSubmission(ANONYMOUS, "p-1")).toBe(false);
  });
});

describe("actorLabel", () => {
  it("identifies the actor without carrying a secret", () => {
    expect(actorLabel(admin)).toBe("admin:s-2");
    expect(actorLabel(competitor)).toBe("participant:p-1");
    expect(actorLabel(ANONYMOUS)).toBe("anonymous");
  });
});
