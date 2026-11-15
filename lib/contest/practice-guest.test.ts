import { describe, expect, it } from "vitest";

import {
  PRACTICE_START_GLOBAL_RULE,
  PRACTICE_START_PER_CLIENT_RULE,
  guestDisplayName,
  planPracticeStart,
  refusalMessage,
} from "@/lib/contest/practice-guest";
import type { Viewer } from "@/lib/contest/viewer";

/**
 * The guest door's policy, as plain functions: what a start does for each kind of browser, what
 * the refusal says, and what a guest is called.
 */

const competitor: Viewer = {
  kind: "competitor",
  participantId: "p1",
  contestId: "c1",
  displayName: "Guest 0042",
  sessionId: "s1",
  userId: null,
};

describe("planPracticeStart", () => {
  it("creates a guest for a browser with no session", () => {
    expect(planPracticeStart({ kind: "anonymous" }, null)).toEqual({ kind: "create" });
  });

  it("reuses a session that is already in the arena instead of minting a second guest", () => {
    expect(planPracticeStart(competitor, true)).toEqual({
      kind: "reuse",
      displayName: "Guest 0042",
    });
  });

  it("refuses a student signed in to a real contest, so the night's session is never replaced", () => {
    expect(planPracticeStart(competitor, false)).toEqual({ kind: "refuse-contest" });
  });

  it("refuses when the competitor's contest no longer exists", () => {
    expect(planPracticeStart(competitor, null)).toEqual({ kind: "refuse-contest" });
  });

  it("refuses an organizer", () => {
    const admin: Viewer = { kind: "admin", displayName: "Org", sessionId: "s2", userId: "u1" };
    expect(planPracticeStart(admin, null)).toEqual({ kind: "refuse-organizer" });
  });
});

describe("refusalMessage", () => {
  it("names the contest and says what to do", () => {
    const message = refusalMessage({ kind: "refuse-contest" }, "Coding Night 2026");
    expect(message).toContain("Coding Night 2026");
    expect(message).toContain("Sign out");
    expect(message).toContain("slip");
  });

  it("speaks to an organizer as an organizer", () => {
    expect(refusalMessage({ kind: "refuse-organizer" }, null)).toContain("organizer");
  });
});

describe("guestDisplayName", () => {
  it("zero-pads to the requested width", () => {
    expect(guestDisplayName(4, () => 42)).toBe("Guest 0042");
    expect(guestDisplayName(6, () => 4821)).toBe("Guest 004821");
  });

  it("draws below 10^digits, so four digits never print a fifth", () => {
    let seenMax = -1;
    guestDisplayName(4, (max) => {
      seenMax = max;
      return max - 1;
    });
    expect(seenMax).toBe(10_000);
    expect(guestDisplayName(4, (max) => max - 1)).toBe("Guest 9999");
  });

  it("uses real randomness by default and keeps the shape", () => {
    expect(guestDisplayName(4)).toMatch(/^Guest \d{4}$/);
  });
});

describe("throttle sizing", () => {
  it("lets a 50-student room behind one address start practice three times over", () => {
    expect(PRACTICE_START_PER_CLIENT_RULE.limit).toBeGreaterThanOrEqual(150);
  });

  it("keeps the global ceiling above the per-client one", () => {
    expect(PRACTICE_START_GLOBAL_RULE.limit).toBeGreaterThan(PRACTICE_START_PER_CLIENT_RULE.limit);
  });
});
