import { describe, expect, it } from "vitest";

import { sameAwardSource } from "@/lib/contest/award-source";
import {
  actorRole,
  composeAwardLabel,
  seatLabel,
} from "@/components/admin/side-activity-format";

/**
 * Where a typed award's points came from. The organizers asked to "identify the puzzle/Kahoot
 * like where the actual points came from", so each award's label names the activity and,
 * optionally, the seat or student it was for, and the same source twice for one team is caught.
 */
describe("composeAwardLabel", () => {
  it("names the activity alone for a whole-team award", () => {
    expect(composeAwardLabel("Kahoot", "")).toBe("Kahoot");
  });

  it("names the seat and student when the award is for one person", () => {
    expect(composeAwardLabel("Sudoku", seatLabel("A", "Chloe Diaz"))).toBe(
      "Sudoku, seat A, Chloe Diaz",
    );
  });

  it("names the student alone when they have no set yet", () => {
    expect(composeAwardLabel(" Cipher ", seatLabel(null, "Lucy Late"))).toBe("Cipher, Lucy Late");
  });
});

describe("sameAwardSource", () => {
  it("treats case and spacing as noise", () => {
    expect(sameAwardSource("Sudoku, seat A, Chloe Diaz", "  sudoku,  seat a, chloe diaz ")).toBe(
      true,
    );
  });

  it("tells two seats' puzzles apart", () => {
    expect(sameAwardSource("Sudoku, seat A, Chloe Diaz", "Sudoku, seat B, Ben Carter")).toBe(false);
  });

  it("tells a team's Kahoot from its puzzles", () => {
    expect(sameAwardSource("Kahoot", "Sudoku")).toBe(false);
  });
});

describe("actorRole", () => {
  it("names the on-site puzzle checker rather than printing its raw label", () => {
    expect(actorRole("puzzle")).toBe("Puzzle checker");
  });

  it("says Organizer and nothing of the session id", () => {
    const role = actorRole("admin:cmwisdpht00c7kn8cs1ocnyn3");
    expect(role).toBe("Organizer");
    expect(role).not.toMatch(/ocnyn3|session|admin:/);
  });

  it("never prints a raw actor it does not recognise", () => {
    expect(actorRole("system:abc123")).toBe("Organizer");
    expect(actorRole("participant:abc")).toBe("Competitor");
  });
});
