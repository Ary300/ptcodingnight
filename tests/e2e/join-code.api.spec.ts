import { expect, test } from "@playwright/test";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — join codes: the door the night actually uses.
 *
 * The teacher's rule is that nobody makes an account at the desk. Organizers build every team
 * beforehand, each seat carries a code, and typing it signs the student in AS that seat. These
 * specs pin the contract from the outside, including the two refusals that matter more than the
 * happy path: a wrong code opens nothing, and a code cannot be used to reach the organizer
 * console.
 */

let seeded: SeededContest;
let admin: ContestApi;

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  admin = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  await closeTestDb();
});

test("an organizer adds a student by name and the response carries their code", async () => {
  const name = `E2E Seat ${String(Date.now())}`;
  const { status, data } = await readOk(
    await admin.addNamedParticipantRaw({ displayName: name }),
  );
  expect(status).toBeLessThan(300);

  const created = data as { participantId: string; displayName: string; joinCode: string };
  expect(created.displayName).toBe(name);
  expect(created.joinCode).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);

  // The seat is an ORDINARY participant with no account: that is what makes every downstream
  // reader (roster, set dealing, team size as the divisor) need no special case.
  const row = await testDb().participant.findUniqueOrThrow({
    where: { id: created.participantId },
    select: { userId: true, joinCode: true, contestId: true },
  });
  expect(row.userId).toBeNull();
  expect(row.joinCode).toBe(created.joinCode);
  expect(row.contestId).toBe(seeded.contestId);
});

test("typing the code signs the student in as that seat, already on their team", async ({
  playwright,
}) => {
  const team = await testDb().team.create({
    data: {
      contestId: seeded.contestId,
      name: `E2E Code Team ${String(Date.now())}`,
      joinCode: `C${String(Date.now()).slice(-5)}`,
    },
    select: { id: true, name: true },
  });

  const { data } = await readOk(
    await admin.addNamedParticipantRaw({
      displayName: `E2E Coder ${String(Date.now())}`,
      teamId: team.id,
    }),
  );
  const created = data as { participantId: string; joinCode: string };

  const context = await playwright.request.newContext();
  const response = await context.post("/api/auth/join-code", {
    data: { code: created.joinCode },
  });
  expect(response.status(), "a valid code must sign the student in").toBe(200);

  const session = await context.get("/api/auth/session");
  const body = (await session.json()) as {
    data: { signedIn?: boolean; contestId: string | null; role?: string };
  };
  expect(body.data.contestId).toBe(seeded.contestId);
  expect(body.data.role).toBe("COMPETITOR");

  // The seat's team membership is what the code bought: the student never chose it. The
  // envelope nests the view under `data.team`, which is null for a competitor on no team.
  const mine = await context.get(`/api/contests/${seeded.contestId}/teams/mine`);
  const view = (await mine.json()) as { data: { team: { name: string } | null } };
  expect(view.data.team?.name).toBe(team.name);
});

test("the code is typed the way it is printed: spaces, dashes and lower case all work", async ({
  playwright,
}) => {
  const { data } = await readOk(
    await admin.addNamedParticipantRaw({ displayName: `E2E Typo ${String(Date.now())}` }),
  );
  const code = (data as { joinCode: string }).joinCode;
  const asTyped = ` ${code.slice(0, 3).toLowerCase()}-${code.slice(3).toLowerCase()} `;

  const context = await playwright.request.newContext();
  const response = await context.post("/api/auth/join-code", { data: { code: asTyped } });
  expect(response.status(), "the code on the slip must work as printed").toBe(200);
});

test("an unknown code opens nothing", async ({ playwright }) => {
  const context = await playwright.request.newContext();
  const envelope = await readEnvelope(
    await context.post("/api/auth/join-code", { data: { code: "ZZZZZZ" } }),
  );
  expect(envelope.status).toBeGreaterThanOrEqual(400);
  expect(envelope.status).toBeLessThan(500);

  const session = await context.get("/api/auth/session");
  const body = (await session.json()) as { data: { contestId: string | null } };
  expect(body.data.contestId, "a refused code must leave no session behind").toBeNull();
});

test("a join code cannot reach the organizer console", async ({ playwright }) => {
  const { data } = await readOk(
    await admin.addNamedParticipantRaw({ displayName: `E2E NotAdmin ${String(Date.now())}` }),
  );
  const context = await playwright.request.newContext();
  await context.post("/api/auth/join-code", { data: { code: (data as { joinCode: string }).joinCode } });

  const envelope = await readEnvelope(await context.get("/api/admin/contests"));
  expect(envelope.status, "a competitor session is not an organizer session").toBeGreaterThanOrEqual(400);
  expect(envelope.status).toBeLessThan(500);
});

test("minting codes is idempotent, so a printed slip never stops working", async () => {
  const { data } = await readOk(
    await admin.addNamedParticipantRaw({ displayName: `E2E Keep ${String(Date.now())}` }),
  );
  const before = (data as { participantId: string; joinCode: string });

  // A seat with no code, the shape a roster built from accounts has.
  const accountSeat = await testDb().participant.findFirst({
    where: { contestId: seeded.contestId, joinCode: null },
    select: { id: true },
  });

  const minted = await readOk(await admin.mintJoinCodesRaw());
  expect(minted.status).toBeLessThan(300);

  const after = await testDb().participant.findUniqueOrThrow({
    where: { id: before.participantId },
    select: { joinCode: true },
  });
  expect(after.joinCode, "an existing code must survive a second mint").toBe(before.joinCode);

  if (accountSeat !== null) {
    const filled = await testDb().participant.findUniqueOrThrow({
      where: { id: accountSeat.id },
      select: { joinCode: true },
    });
    expect(filled.joinCode, "a seat without a code should have gained one").not.toBeNull();
  }
});
