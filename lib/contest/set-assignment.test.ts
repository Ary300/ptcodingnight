import { describe, expect, it } from "vitest";

import {
  assignSetForOne,
  assignSets,
  canReadSet,
  type AssignableParticipant,
} from "@/lib/contest/set-assignment";

const SETS = ["A", "B", "C", "D"];

function team(teamId: string, count: number): AssignableParticipant[] {
  return Array.from({ length: count }, (_, i) => ({
    participantId: `${teamId}-${i + 1}`,
    teamId,
  }));
}

describe("assignSets is reproducible", () => {
  it("produces the same assignment for the same seed and roster", () => {
    // The property the whole design exists for: an organizer must be able to re-derive an
    // assignment in front of a student who disputes it (PRD §6.2).
    const participants = [...team("t1", 4), ...team("t2", 3)];
    const first = assignSets({ seed: "seed-1", setIds: SETS, participants });
    const second = assignSets({ seed: "seed-1", setIds: SETS, participants });

    expect(first).toEqual(second);
  });

  it("does not depend on the order the roster was read in", () => {
    // Postgres is free to return participants in any order, and an assignment that changed with
    // row order would not be re-derivable.
    const participants = [...team("t1", 4), ...team("t2", 3)];
    const forward = assignSets({ seed: "seed-1", setIds: SETS, participants });
    const reversed = assignSets({
      seed: "seed-1",
      setIds: SETS,
      participants: [...participants].reverse(),
    });

    expect(forward).toEqual(reversed);
  });

  it("produces a different assignment for a different seed", () => {
    // Otherwise the seed is decorative and every contest gets the same assignment.
    const participants = [...team("t1", 4), ...team("t2", 4)];
    const a = assignSets({ seed: "seed-1", setIds: SETS, participants });
    const b = assignSets({ seed: "seed-2", setIds: SETS, participants });

    expect(a).not.toEqual(b);
  });
});

describe("assignSets is balanced within a team", () => {
  it("gives a team of four four different sets", () => {
    // Naive per-player random would sometimes hand three teammates the same set, which defeats
    // the purpose of parallel sets: teammates on identical problems can just share answers.
    const assignments = assignSets({ seed: "s", setIds: SETS, participants: team("t1", 4) });
    const used = assignments.map((a) => a.setId);

    expect(new Set(used).size).toBe(4);
  });

  it("gives a team of two two different sets", () => {
    const assignments = assignSets({ seed: "s", setIds: SETS, participants: team("t1", 2) });
    expect(new Set(assignments.map((a) => a.setId)).size).toBe(2);
  });

  it("wraps for a team larger than the set count, rather than failing", () => {
    // Five players, four sets: exactly one set must repeat, and no player may go unassigned.
    const assignments = assignSets({ seed: "s", setIds: SETS, participants: team("t1", 5) });

    expect(assignments).toHaveLength(5);
    expect(new Set(assignments.map((a) => a.setId)).size).toBe(4);
  });

  it("stays balanced for every team independently", () => {
    const participants = [...team("t1", 4), ...team("t2", 4), ...team("t3", 3)];
    const assignments = assignSets({ seed: "s", setIds: SETS, participants });

    for (const teamId of ["t1", "t2", "t3"]) {
      const members = assignments.filter((a) => a.participantId.startsWith(`${teamId}-`));
      expect(new Set(members.map((a) => a.setId)).size).toBe(members.length);
    }
  });
});

describe("assignSets edge cases", () => {
  it("assigns a participant with no team", () => {
    // A null teamId is what a mid-contest roster edit leaves behind. They still compete, so they
    // still need a set.
    const assignments = assignSets({
      seed: "s",
      setIds: SETS,
      participants: [{ participantId: "loner", teamId: null }],
    });

    expect(assignments).toHaveLength(1);
    expect(SETS).toContain(assignments[0]?.setId);
  });

  it("returns nothing when there are no sets rather than throwing", () => {
    expect(assignSets({ seed: "s", setIds: [], participants: team("t1", 3) })).toEqual([]);
  });

  it("assigns every participant exactly once", () => {
    const participants = [...team("t1", 4), ...team("t2", 5), { participantId: "x", teamId: null }];
    const assignments = assignSets({ seed: "s", setIds: SETS, participants });

    expect(assignments).toHaveLength(participants.length);
    expect(new Set(assignments.map((a) => a.participantId)).size).toBe(participants.length);
  });

  it("does not systematically favour set A", () => {
    // A rotation that always started at the first set would give "A" to every team's first member.
    // Across many teams the distribution should be broad.
    const participants = Array.from({ length: 20 }, (_, i) => team(`t${i}`, 1)).flat();
    const assignments = assignSets({ seed: "spread", setIds: SETS, participants });
    const counts = new Map<string, number>();
    for (const a of assignments) counts.set(a.setId, (counts.get(a.setId) ?? 0) + 1);

    expect(counts.size).toBeGreaterThan(1);
    expect(counts.get("A") ?? 0).toBeLessThan(assignments.length);
  });
});

describe("canReadSet", () => {
  it("allows a player to read their own set", () => {
    expect(
      canReadSet({ problemSetId: "A", participantSetId: "A", allowReadingUnassignedSets: false }),
    ).toBe(true);
  });

  it("refuses a set the player was not assigned", () => {
    // The default, and it is enforced in the API rather than hidden in the UI: a set a competitor
    // can read is a set they can practise on before their own round.
    expect(
      canReadSet({ problemSetId: "B", participantSetId: "A", allowReadingUnassignedSets: false }),
    ).toBe(false);
  });

  it("allows any set when the config flag is on", () => {
    expect(
      canReadSet({ problemSetId: "B", participantSetId: "A", allowReadingUnassignedSets: true }),
    ).toBe(true);
  });

  it("allows a group problem, which belongs to no set", () => {
    expect(
      canReadSet({ problemSetId: null, participantSetId: "A", allowReadingUnassignedSets: false }),
    ).toBe(true);
  });

  it("refuses a set problem to a player with no assignment yet", () => {
    // Before assignment runs, a competitor should see nothing from Round 1 rather than everything.
    expect(
      canReadSet({ problemSetId: "A", participantSetId: null, allowReadingUnassignedSets: false }),
    ).toBe(false);
  });
});

/**
 * T5: the algorithm half of "re-joining must not re-roll the set".
 *
 * The route half — that a rejoin resolves to the same *participant* at all — is `joinContest` and
 * the G7 specs in `tests/e2e/set-assignment.api.spec.ts`. What is checked here is the property
 * those depend on: given the same participant and the same stored seed, the answer never moves.
 */
describe("assignSetForOne is idempotent", () => {
  const SEED = "0123456789abcdef0123456789abcdef";
  const PARTICIPANT = "clx0000000000000000000001";

  it("returns the same set every time for the same participant and seed", () => {
    const once = assignSetForOne({
      seed: SEED,
      setIds: SETS,
      participantId: PARTICIPANT,
      takenInTeam: [],
    });

    for (let i = 0; i < 50; i += 1) {
      expect(
        assignSetForOne({
          seed: SEED,
          setIds: SETS,
          participantId: PARTICIPANT,
          takenInTeam: [],
        }),
      ).toBe(once);
    }
  });

  /**
   * The seed is the contest's, stored on the row, so a re-derivation months later reproduces the
   * night. If the answer depended on anything else — a clock, a counter, insertion order — the
   * organizer's "here is why you got set C" would not survive being checked.
   */
  it("is a function of the seed alone, not of when or how often it runs", () => {
    const a = assignSetForOne({
      seed: SEED,
      setIds: SETS,
      participantId: PARTICIPANT,
      takenInTeam: [],
    });
    const b = assignSetForOne({
      seed: `${SEED}-different`,
      setIds: SETS,
      participantId: PARTICIPANT,
      takenInTeam: [],
    });
    // Not asserting they differ — two seeds may legitimately agree. Asserting each is stable.
    expect(
      assignSetForOne({ seed: SEED, setIds: SETS, participantId: PARTICIPANT, takenInTeam: [] }),
    ).toBe(a);
    expect(
      assignSetForOne({
        seed: `${SEED}-different`,
        setIds: SETS,
        participantId: PARTICIPANT,
        takenInTeam: [],
      }),
    ).toBe(b);
  });

  /**
   * Different participants may draw different sets — that is the point of assignment. This is
   * recorded so the idempotency test above cannot be satisfied by a constant, which would pass
   * every assertion here and hand the whole room set A.
   */
  it("does not simply hand everyone the same set", () => {
    const drawn = new Set(
      Array.from({ length: 40 }, (_, i) =>
        assignSetForOne({
          seed: SEED,
          setIds: SETS,
          participantId: `clx000000000000000000${String(i).padStart(4, "0")}`,
          takenInTeam: [],
        }),
      ),
    );
    expect(drawn.size).toBeGreaterThan(1);
  });
});
