import { randomInt } from "node:crypto";

import { prisma } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { assertCanJoin } from "@/lib/contest/gate";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/contest/audit";
import { byDisplayName } from "@/lib/contest/code-wall";

/**
 * Per-person join codes: the way most students get into the contest.
 *
 * ## The flow this exists for
 *
 * The teacher's rule: on the night, nobody makes an account. Before the contest the organizers
 * build the whole roster - every team, every member - and the platform mints one code per SEAT.
 * A student types their code and is instantly signed in as that participant, already on that
 * team, already in that division, already holding whatever set was dealt to them.
 *
 * So a code is not a password and it is not an identity. It is a claim on a roster seat that
 * already exists. Accounts still work and are untouched; this is a third door beside them.
 *
 * ## Why the code is not a security control, and what is
 *
 * Guessing a code lets you sit in a seat an organizer made, in a contest whose leaderboard is
 * public anyway. What it cannot do is create a seat, join a second team, reach the organizer
 * console, or outlive the contest: those are enforced server-side and do not depend on the code
 * being unguessable. It is sized for LEGIBILITY - a student reads it off a slip of paper and
 * types it once - which is why the alphabet drops the characters people mishear.
 *
 * 30^6 is about 730 million, and a collision is refused by a unique index rather than hoped
 * against: `mintJoinCode` retries, and the database is the arbiter.
 */

/** No O, 0, I or 1: the four characters a person reads wrong off a printed slip. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export const JOIN_CODE_LENGTH = 6;

/** What a student reads when the code does not open a seat. Says what to do next. */
const UNKNOWN_CODE_MESSAGE =
  "That code does not match anybody on the roster. Check the slip an organizer gave you, and " +
  "ask them to read it out if it still does not work.";

/** One fresh candidate. `randomInt` rather than Math.random: modulo bias would clump codes. */
export function newJoinCode(): string {
  let code = "";
  for (let index = 0; index < JOIN_CODE_LENGTH; index += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/**
 * What a student types, normalised to what is stored.
 *
 * Uppercased and stripped of spaces and dashes, because a code printed as `7K4-Q9M` gets typed
 * back every way a person can type it, and refusing "the code on the paper" over a dash is the
 * most annoying possible failure.
 *
 * NO confusable-character mapping, deliberately. The tempting move is to fold `O` onto `0` and
 * `I` onto `1`, but this alphabet contains none of those four: a typed `O` is a misread of `Q`,
 * `D` or `U` and there is no way to know which. Guessing would sign a student into somebody
 * else's seat, so an unrecognised code says so and the organizer reads it out again.
 */
export function normalizeJoinCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, "");
}

export interface JoinCodeSeat {
  readonly participantId: string;
  readonly contestId: string;
  readonly displayName: string;
  readonly teamName: string | null;
}

/**
 * Find the seat a code claims, refusing every reason it should not open.
 *
 * The contest gate is asked rather than re-implemented (`assertCanJoin`), so a code for a
 * contest that has ended fails the same way every other entry path fails, with the same
 * sentence. An unknown code and a code for a finished contest are deliberately DIFFERENT
 * messages: the first is "check the code", the second is "the code is fine, the contest is
 * over", and telling a student the wrong one of those wastes an organizer's night.
 */
export async function seatForJoinCode(code: string): Promise<JoinCodeSeat> {
  const normalized = normalizeJoinCode(code);
  /*
    One sentence for both "wrong length" and "no such code", and it names the next action. A
    student at the desk cannot act on "not found"; they can act on "check the slip and ask an
    organizer". The two cases are also not worth distinguishing to a guesser.
  */
  if (normalized.length !== JOIN_CODE_LENGTH) {
    throw new DomainError("NOT_FOUND", UNKNOWN_CODE_MESSAGE);
  }

  const participant = await prisma.participant.findUnique({
    where: { joinCode: normalized },
    select: {
      id: true,
      contestId: true,
      displayName: true,
      team: { select: { name: true } },
      contest: { select: { state: true } },
    },
  });
  if (participant === null) throw new DomainError("NOT_FOUND", UNKNOWN_CODE_MESSAGE);

  assertCanJoin(participant.contest.state);

  return {
    participantId: participant.id,
    contestId: participant.contestId,
    displayName: participant.displayName,
    teamName: participant.team?.name ?? null,
  };
}

/**
 * Give a participant a code, retrying past the vanishingly rare collision.
 *
 * The unique index is the arbiter, not a pre-flight SELECT: two organizers importing rosters at
 * once would both read "free" and one would then fail on insert, so the write IS the check.
 */
export async function mintJoinCode(participantId: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = newJoinCode();
    try {
      await prisma.participant.update({
        where: { id: participantId },
        data: { joinCode: code },
      });
      return code;
    } catch (error: unknown) {
      // P2002 is the unique-index refusal: that code is taken, try another. Anything else is
      // a real failure and must not be retried into a loop.
      const isCollision =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002";
      if (!isCollision) throw error;
    }
  }
  throw new DomainError(
    "CONFLICT",
    "Could not find a free join code after several tries. Try again.",
  );
}

/**
 * Replace a seat's code, invalidating whatever was printed for it.
 *
 * DELIBERATE and manual, never automatic. A move between teams does not reissue: the code
 * identifies the PERSON, so after a move it signs them into their new team and the slip in their
 * hand keeps working. Reissuing exists for the cases where the old slip must stop working, and
 * they are all human problems rather than data ones:
 *
 *  - the wrong student was handed the wrong slip;
 *  - a slip was lost, or photographed, or read out to the room;
 *  - the seat is being reused for a different student entirely.
 *
 * Audited, because "my code stopped working" needs an answer better than a shrug.
 */
export async function reissueJoinCode(
  participantId: string,
  actor: string,
): Promise<{ displayName: string; joinCode: string }> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { id: true, displayName: true, joinCode: true, contestId: true },
  });
  if (participant === null) throw new NotFoundError("Participant");

  const joinCode = await mintJoinCode(participant.id);
  await writeAudit({
    actor,
    action: AUDIT_ACTIONS.participantJoinCodeReissued,
    entity: `Participant:${participant.id}`,
    before: { hadCode: participant.joinCode !== null },
    after: { displayName: participant.displayName },
    reason: "the previous slip no longer opens this seat",
  });
  return { displayName: participant.displayName, joinCode };
}

/**
 * Who does this code belong to? The organizer's desk lookup.
 *
 * A team prefix inside the code was the tempting way to answer "whose slip is this" at the desk.
 * This answers it without putting a fact that changes into a string that cannot: the code stays
 * opaque, and the console resolves it on demand.
 *
 * Admin-only, and it never signs anybody in.
 */
export async function whoseJoinCode(code: string): Promise<{
  displayName: string;
  teamName: string | null;
  divisionName: string | null;
  setLabel: string | null;
  contestName: string;
  contestState: string;
}> {
  const normalized = normalizeJoinCode(code);
  const participant = await prisma.participant.findUnique({
    where: { joinCode: normalized },
    select: {
      displayName: true,
      team: { select: { name: true } },
      division: { select: { name: true } },
      chosenSet: { select: { label: true } },
      contest: { select: { name: true, state: true } },
    },
  });
  if (participant === null) throw new DomainError("NOT_FOUND", UNKNOWN_CODE_MESSAGE);

  return {
    displayName: participant.displayName,
    teamName: participant.team?.name ?? null,
    divisionName: participant.division?.name ?? null,
    setLabel: participant.chosenSet?.label ?? null,
    contestName: participant.contest.name,
    contestState: participant.contest.state,
  };
}

/**
 * Every seat in the contest that has a code, A to Z, with whether that seat is already signed in.
 *
 * Feeds the projected code wall (`/admin/contests/{id}/wall`). The paging and the ordering rule live
 * in `lib/contest/code-wall.ts`, which is pure so the client component can import it; this is the
 * read, and it stays here with the rest of the code handling.
 *
 * "Arrived" means a LIVE session, not any session that ever existed: an organizer who revokes a
 * student's session has decided that student must sign in again, so their code comes back onto the
 * wall. Expiry is read the same way, for the same reason.
 */
export async function codeWallSeats(
  contestId: string,
  now: Date,
): Promise<readonly CodeWallSeatRow[]> {
  const participants = await prisma.participant.findMany({
    where: { contestId, joinCode: { not: null } },
    select: {
      id: true,
      displayName: true,
      joinCode: true,
      team: { select: { name: true } },
      division: { select: { name: true } },
      _count: {
        select: { sessions: { where: { revokedAt: null, expiresAt: { gt: now } } } },
      },
    },
  });

  return participants
    .map((participant) => ({
      participantId: participant.id,
      displayName: participant.displayName,
      // Non-null by the query's own filter. The fallback keeps the type honest without a cast.
      joinCode: participant.joinCode ?? "",
      teamName: participant.team?.name ?? null,
      divisionName: participant.division?.name ?? null,
      arrived: participant._count.sessions > 0,
    }))
    .sort(byDisplayName);
}

export interface CodeWallSeatRow {
  readonly participantId: string;
  readonly displayName: string;
  readonly joinCode: string;
  readonly teamName: string | null;
  readonly divisionName: string | null;
  readonly arrived: boolean;
}
