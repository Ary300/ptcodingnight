import type { StandingsResponse } from "@/lib/schemas/api";

/**
 * Stand-in standings for when `/api/standings` is not reachable.
 *
 * This exists because `app/api/**` is owned by another agent and may not be present in this
 * worktree. It is deliberately named "sample" everywhere it surfaces, and the board renders
 * a visible `SAMPLE DATA` marker whenever it is in use — nobody in the room should ever be
 * able to mistake it for a real result.
 *
 * It is shaped by `StandingsResponseSchema`, so when the real route lands this file stops
 * being reached and nothing else changes.
 *
 * Times are relative to module load so the countdown is always mid-contest in a demo.
 */

const now = Date.now();
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

export const PROJECTOR_SAMPLE_STANDINGS: StandingsResponse = {
  contestId: "sample-contest",
  frozen: false,
  asOf: iso(0),
  endsAt: iso(37 * 60_000),
  divisions: [
    {
      divisionId: "sample-intermediate",
      name: "Intermediate",
      rows: [
        { rank: 1, isTied: false, participantId: "s-i-1", displayName: "Priya Raman", score: 720, penaltyMinutes: 18, delta: 2 },
        { rank: 2, isTied: false, participantId: "s-i-2", displayName: "Marcus Whitfield", score: 690, penaltyMinutes: 24, delta: -1 },
        { rank: 3, isTied: true, participantId: "s-i-3", displayName: "Dana Okonkwo", score: 640, penaltyMinutes: 31, delta: 0 },
        { rank: 3, isTied: true, participantId: "s-i-4", displayName: "Eli Brandt", score: 640, penaltyMinutes: 31, delta: 4 },
        { rank: 5, isTied: false, participantId: "s-i-5", displayName: "Sofia Marchetti", score: 610, penaltyMinutes: 12, delta: -2 },
        { rank: 6, isTied: false, participantId: "s-i-6", displayName: "Theo Nakamura", score: 555, penaltyMinutes: 40, delta: 1 },
        { rank: 7, isTied: false, participantId: "s-i-7", displayName: "Amara Bell", score: 500, penaltyMinutes: 8, delta: 0 },
        { rank: 8, isTied: false, participantId: "s-i-8", displayName: "Jonah Kessler", score: 470, penaltyMinutes: 52, delta: -3 },
        { rank: 9, isTied: false, participantId: "s-i-9", displayName: "Ruth Alvarado", score: 430, penaltyMinutes: 16, delta: 0 },
        { rank: 10, isTied: false, participantId: "s-i-10", displayName: "Caleb Ferris", score: 385, penaltyMinutes: 27, delta: 2 },
        { rank: 11, isTied: false, participantId: "s-i-11", displayName: "Nadia Oyelaran", score: 340, penaltyMinutes: 9, delta: -1 },
      ],
    },
    {
      divisionId: "sample-advanced",
      name: "Advanced",
      rows: [
        { rank: 1, isTied: false, participantId: "s-a-1", displayName: "Wen Zhao", score: 980, penaltyMinutes: 21, delta: 1 },
        { rank: 2, isTied: false, participantId: "s-a-2", displayName: "Isabel Guerrero", score: 940, penaltyMinutes: 15, delta: -1 },
        { rank: 3, isTied: false, participantId: "s-a-3", displayName: "Owen Blackwood", score: 875, penaltyMinutes: 33, delta: 3 },
        { rank: 4, isTied: false, participantId: "s-a-4", displayName: "Hana Petrov", score: 820, penaltyMinutes: 19, delta: 0 },
        { rank: 5, isTied: false, participantId: "s-a-5", displayName: "Devin Achebe", score: 795, penaltyMinutes: 44, delta: -2 },
        { rank: 6, isTied: false, participantId: "s-a-6", displayName: "Lucia Fontaine", score: 730, penaltyMinutes: 11, delta: 0 },
        { rank: 7, isTied: false, participantId: "s-a-7", displayName: "Samir Haddad", score: 690, penaltyMinutes: 28, delta: 5 },
        { rank: 8, isTied: false, participantId: "s-a-8", displayName: "Greta Lindqvist", score: 645, penaltyMinutes: 36, delta: -1 },
      ],
    },
  ],
};
