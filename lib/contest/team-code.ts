import { randomInt } from "node:crypto";

/**
 * Team join codes.
 *
 * These are read aloud across a room — "we're SEVEN-K-M-4-P-2" — so the alphabet matters more
 * than the entropy. `O`/`0` and `I`/`1` are excluded because a student who mishears one joins
 * nobody's team and then asks an organizer why, which costs more time than a longer code would.
 * `S`/`5` and `B`/`8` are kept: they are distinguishable when spoken, unlike O/0.
 *
 * ## Why this is not a security control
 *
 * A team code lets you join a team. It is not a credential and it protects nothing: a team's
 * membership is public on the leaderboard anyway, and the worst a guessed code does is put
 * somebody on a team an organizer can move them off. The guardrails that matter — one team per
 * participant, a maximum size, and formation closing when the contest starts — are enforced
 * server-side and do not depend on the code being unguessable.
 *
 * So this is sized for *legibility*, not for brute force. 30^6 is about 730 million, which is
 * ample for a room of thirty.
 */

/** No O, 0, I, or 1. Everything else is fair game and stays distinguishable when spoken. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export const TEAM_CODE_LENGTH = 6;

/**
 * A fresh code. Uses `randomInt` rather than `Math.random()` — not because this is a secret, but
 * because a modulo-biased generator would make some codes far more likely than others, and a
 * collision inside one contest is a student joining the wrong team.
 */
export function newTeamCode(): string {
  let code = "";
  for (let i = 0; i < TEAM_CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/**
 * Normalise what a student typed.
 *
 * Uppercased and stripped of spaces and dashes, because somebody will type `7km-4p2` or
 * `7 K M 4 P 2` from a whiteboard. The stored code is the canonical form; this is the only
 * place that decides what counts as the same code.
 */
export function normaliseTeamCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]+/g, "");
}
