import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext } from "@playwright/test";
import { z } from "zod";

import { SESSION_COOKIE } from "@/lib/contest/session";
import { issueSession } from "@/lib/contest/session-store";
import {
  AccountProfileSchema,
  RenameAccountResponseSchema,
  type StandingsResponse,
} from "@/lib/schemas/api";

import { ContestApi, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * A frozen leaderboard is a historical view, including its identities and its roster.
 *
 * This spec uses three private contests rather than the shared seeded fixture. One account has a
 * participant in a frozen contest, a completed contest and a mutable contest, which proves a
 * single profile rename makes the right decision independently for every board. The mutable board
 * is read before the rename on purpose: seeing the new name immediately afterwards also proves the
 * short-lived scoring-input cache was invalidated.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const SessionIdentitySchema = z.object({
  signedIn: z.literal(true),
  displayName: z.string(),
});

function namesOn(board: StandingsResponse): string[] {
  return board.divisions.flatMap((division) =>
    division.rows.map((row) => row.displayName),
  );
}

test.describe.configure({ mode: "serial" });

test.describe("frozen identity history", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const contestIds: string[] = [];
  let userId = "";
  let accountContext: APIRequestContext | undefined;
  let adminContext: APIRequestContext | undefined;
  let anonymousContext: APIRequestContext | undefined;

  test.afterAll(async () => {
    await accountContext?.dispose();
    await adminContext?.dispose();
    await anonymousContext?.dispose();

    if (contestIds.length > 0) {
      await testDb().contest.deleteMany({ where: { id: { in: contestIds } } });
    }
    if (userId !== "") {
      await testDb().user.deleteMany({ where: { id: userId } });
    }
    await closeTestDb();
  });

  test("keeps frozen and completed names historical while live account data moves forward", async ({
    playwright,
    baseURL,
  }) => {
    const now = new Date();
    const startsAt = new Date(now.getTime() - 60 * 60_000);
    const endsAt = new Date(now.getTime() + 60 * 60_000);
    const freezeAt = new Date(now.getTime() - 20 * 60_000);
    const beforeFreeze = new Date(freezeAt.getTime() - 5 * 60_000);
    const afterFreeze = new Date(freezeAt.getTime() + 5 * 60_000);

    const frozenName = `Frozen Name ${suffix}`;
    const lateName = `Late Arrival ${suffix}`;
    const completedName = `Completed Name ${suffix}`;
    const mutableName = `Mutable Name ${suffix}`;
    const wantedName = `Current Name ${suffix}`;

    const user = await testDb().user.create({
      data: {
        displayName: frozenName,
        email: `frozen-identity-${suffix}@e2e.invalid`,
        role: "COMPETITOR",
      },
      select: { id: true },
    });
    userId = user.id;

    const frozen = await testDb().contest.create({
      data: {
        name: `Frozen Identity ${suffix}`,
        joinCode: `FZI${suffix}`,
        scoringPresetId: "coding-night-classic",
        startsAt,
        endsAt,
        freezeAt,
        state: "FROZEN",
        divisions: { create: { name: "Open", sortOrder: 0 } },
        teams: {
          create: {
            name: `Frozen Team ${suffix}`,
            joinCode: `FZT${suffix}`,
          },
        },
      },
      select: {
        id: true,
        divisions: { select: { id: true } },
        teams: { select: { id: true } },
      },
    });
    contestIds.push(frozen.id);

    const completed = await testDb().contest.create({
      data: {
        name: `Completed Identity ${suffix}`,
        joinCode: `CPI${suffix}`,
        scoringPresetId: "coding-night-classic",
        startsAt: new Date(now.getTime() - 3 * 60 * 60_000),
        endsAt: new Date(now.getTime() - 2 * 60 * 60_000),
        freezeAt: null,
        state: "ENDED",
        divisions: { create: { name: "Open", sortOrder: 0 } },
      },
      select: { id: true, divisions: { select: { id: true } } },
    });
    contestIds.push(completed.id);

    const mutable = await testDb().contest.create({
      data: {
        name: `Mutable Identity ${suffix}`,
        joinCode: `MUI${suffix}`,
        scoringPresetId: "coding-night-classic",
        startsAt,
        endsAt,
        freezeAt: null,
        state: "RUNNING",
        divisions: { create: { name: "Open", sortOrder: 0 } },
      },
      select: { id: true, divisions: { select: { id: true } } },
    });
    contestIds.push(mutable.id);

    const frozenDivisionId = frozen.divisions[0]?.id;
    const frozenTeamId = frozen.teams[0]?.id;
    const completedDivisionId = completed.divisions[0]?.id;
    const mutableDivisionId = mutable.divisions[0]?.id;
    if (
      frozenDivisionId === undefined ||
      frozenTeamId === undefined ||
      completedDivisionId === undefined ||
      mutableDivisionId === undefined
    ) {
      throw new Error(
        "The frozen-identity fixture did not create its nested rows",
      );
    }

    const frozenParticipant = await testDb().participant.create({
      data: {
        contestId: frozen.id,
        userId,
        displayName: frozenName,
        divisionId: frozenDivisionId,
        teamId: frozenTeamId,
        joinedAt: beforeFreeze,
      },
      select: { id: true },
    });
    await testDb().participant.create({
      data: {
        contestId: frozen.id,
        displayName: lateName,
        divisionId: frozenDivisionId,
        teamId: frozenTeamId,
        joinedAt: afterFreeze,
      },
    });
    const completedParticipant = await testDb().participant.create({
      data: {
        contestId: completed.id,
        userId,
        displayName: completedName,
        divisionId: completedDivisionId,
        joinedAt: new Date(now.getTime() - 3 * 60 * 60_000),
      },
      select: { id: true },
    });
    const mutableParticipant = await testDb().participant.create({
      data: {
        contestId: mutable.id,
        userId,
        displayName: mutableName,
        divisionId: mutableDivisionId,
        joinedAt: startsAt,
      },
      select: { id: true },
    });

    const session = await issueSession(
      {
        role: "COMPETITOR",
        method: "GOOGLE",
        displayName: frozenName,
        participantId: frozenParticipant.id,
        contestId: frozen.id,
        userId,
      },
      now,
    );

    const account = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { cookie: `${SESSION_COOKIE}=${session.token}` },
    });
    const adminRequest = await playwright.request.newContext({ baseURL });
    const anonymousRequest = await playwright.request.newContext({ baseURL });
    accountContext = account;
    adminContext = adminRequest;
    anonymousContext = anonymousRequest;

    const publicFrozen = new ContestApi(anonymousRequest, frozen.id);
    const publicCompleted = new ContestApi(anonymousRequest, completed.id);
    const publicMutable = new ContestApi(anonymousRequest, mutable.id);
    const adminFrozen = new ContestApi(adminRequest, frozen.id);
    await adminFrozen.adminLogin(ADMIN_PASSCODE);

    await test.step("a late participant is hidden publicly but visible to the organizer", async () => {
      const frozenBoard = await publicFrozen.standings();
      expect(frozenBoard.frozen).toBe(true);
      expect(namesOn(frozenBoard)).toContain(frozenName);
      expect(namesOn(frozenBoard)).not.toContain(lateName);

      const frozenTeam = (await publicFrozen.teamStandings()).teams.find(
        (team) => team.teamId === frozenTeamId,
      );
      expect(frozenTeam?.players.map((player) => player.displayName)).toContain(
        frozenName,
      );
      expect(
        frozenTeam?.players.map((player) => player.displayName),
      ).not.toContain(lateName);

      const organizerBoard = await adminFrozen.standings();
      expect(organizerBoard.frozen).toBe(false);
      expect(namesOn(organizerBoard)).toContain(lateName);
    });

    await test.step("renaming updates the account and live session but preserves locked boards", async () => {
      // Warm both caches first. The mutable board changing on the very next request is the cache
      // invalidation assertion, not merely a database assertion.
      expect(namesOn(await publicMutable.standings())).toContain(mutableName);
      expect(namesOn(await publicCompleted.standings())).toContain(
        completedName,
      );

      const renamed = await readOk(
        await account.patch("/api/me", { data: { displayName: wantedName } }),
      );
      expect(renamed.status).toBe(200);
      expect(RenameAccountResponseSchema.parse(renamed.data)).toEqual({
        displayName: wantedName,
        adjustedOnABoard: false,
        preservedOnLockedBoards: true,
      });

      const profile = await readOk(await account.get("/api/me"));
      expect(profile.status).toBe(200);
      expect(AccountProfileSchema.parse(profile.data).displayName).toBe(
        wantedName,
      );

      const liveSession = await readOk(await account.get("/api/auth/session"));
      expect(liveSession.status).toBe(200);
      expect(SessionIdentitySchema.parse(liveSession.data).displayName).toBe(
        wantedName,
      );

      const stored = await testDb().participant.findMany({
        where: {
          id: {
            in: [
              frozenParticipant.id,
              completedParticipant.id,
              mutableParticipant.id,
            ],
          },
        },
        select: { id: true, displayName: true },
      });
      const storedNames = new Map(
        stored.map((participant) => [participant.id, participant.displayName]),
      );
      expect(storedNames.get(frozenParticipant.id)).toBe(frozenName);
      expect(storedNames.get(completedParticipant.id)).toBe(completedName);
      expect(storedNames.get(mutableParticipant.id)).toBe(wantedName);

      expect(namesOn(await publicFrozen.standings())).toContain(frozenName);
      expect(namesOn(await publicFrozen.standings())).not.toContain(wantedName);
      const playerNames = (await publicFrozen.teamStandings()).teams
        .find((team) => team.teamId === frozenTeamId)
        ?.players.map((player) => player.displayName);
      expect(playerNames).toContain(frozenName);
      expect(playerNames).not.toContain(wantedName);

      expect(namesOn(await publicCompleted.standings())).toContain(
        completedName,
      );
      expect(namesOn(await publicCompleted.standings())).not.toContain(
        wantedName,
      );
      expect(namesOn(await publicMutable.standings())).toContain(wantedName);
      expect(namesOn(await publicMutable.standings())).not.toContain(
        mutableName,
      );
    });

    await test.step("the reveal includes the participant who joined after the cutoff", async () => {
      const revealed = await adminFrozen.freeze(false);
      expect(revealed.frozen).toBe(false);

      const revealedBoard = await publicFrozen.standings();
      expect(revealedBoard.frozen).toBe(false);
      expect(namesOn(revealedBoard)).toContain(lateName);
    });
  });
});
