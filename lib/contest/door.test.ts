import { describe, expect, it } from "vitest";

import { doorFor, firstNameOf } from "./door";
import type { CompetitorViewer } from "./viewer";

const competitor: CompetitorViewer = {
  kind: "competitor",
  participantId: "p1",
  contestId: "c1",
  displayName: "Jo Notice",
  sessionId: "s1",
  userId: null,
};

describe("firstNameOf", () => {
  it("takes the first word of a roster name", () => {
    expect(firstNameOf("Jo Notice")).toBe("Jo");
    expect(firstNameOf("  Ada   Lovelace King ")).toBe("Ada");
  });

  it("keeps a one-word name whole", () => {
    expect(firstNameOf("Priya")).toBe("Priya");
  });

  it("never yields an empty name", () => {
    expect(firstNameOf("")).toBe("you");
    expect(firstNameOf("   ")).toBe("you");
  });
});

describe("doorFor", () => {
  it("leaves anonymous and organizer viewers as themselves", () => {
    expect(doorFor({ kind: "anonymous" }, null)).toEqual({ kind: "anonymous" });
    expect(
      doorFor({ kind: "admin", displayName: "Org", sessionId: "s", userId: "u" }, null),
    ).toEqual({ kind: "admin" });
  });

  it("tells a practice guest from a seat by the contest's isPractice", () => {
    const guest = { ...competitor, displayName: "Guest 1234" };
    expect(doorFor(guest, { isPractice: true, name: "Practice" })).toEqual({
      kind: "practice",
      displayName: "Guest 1234",
      participantId: "p1",
    });
    expect(doorFor(competitor, { isPractice: false, name: "Coding Night" })).toEqual({
      kind: "seat",
      displayName: "Jo Notice",
      firstName: "Jo",
      participantId: "p1",
      contestName: "Coding Night",
    });
  });

  it("treats a competitor with an unreadable contest as a seat, never as a guest", () => {
    expect(doorFor(competitor, null)).toMatchObject({ kind: "seat", contestName: null });
  });
});
