import { expect, test } from "@playwright/test";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — the projected code wall.
 *
 * This is the most sensitive read in the console: every join code in the contest, and a join code
 * signs its holder in as that student. So the specs here are mostly about who may read it, and
 * about the one behaviour the screen depends on — a seat that is already signed in stops showing
 * its code, which is what makes the wall shrink as the room fills.
 */

let seeded: SeededContest;
let admin: ContestApi;
let contestId: string;

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  contestId = seeded.contestId;
  admin = new ContestApi(await playwright.request.newContext(), contestId);
  await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  await closeTestDb();
});

async function newSeat(name: string): Promise<{ participantId: string; joinCode: string }> {
  const { data } = await readOk(
    await admin.addNamedParticipantRaw({
      displayName: `${name} ${String(Date.now())}-${String(Math.random()).slice(2, 6)}`,
    }),
  );
  return data as { participantId: string; joinCode: string };
}

test("an organizer gets every seat's code, A to Z", async () => {
  await newSeat("Zoe Wall");
  await newSeat("Aditi Wall");

  const { data } = await readOk(await admin.codeWallRaw());
  const wall = data as {
    contestName: string;
    seats: { displayName: string; joinCode: string; arrived: boolean }[];
    seatsWithoutCode: number;
  };

  expect(wall.contestName.length).toBeGreaterThan(0);
  expect(wall.seats.length).toBeGreaterThanOrEqual(2);
  // Every row carries a code, because the query only selects seats that have one.
  expect(wall.seats.every((seat) => seat.joinCode.length > 0)).toBe(true);

  // Sorted by the server, so the wall's paging is not at the mercy of a client sort.
  const names = wall.seats.map((seat) => seat.displayName.toLowerCase());
  expect([...names].sort()).toEqual(names);
});

test("a seat stops showing its code once it signs in", async ({ playwright }) => {
  const seat = await newSeat("Arrival Wall");

  const before = (await readOk(await admin.codeWallRaw())).data as {
    seats: { participantId: string; arrived: boolean }[];
  };
  expect(
    before.seats.find((row) => row.participantId === seat.participantId)?.arrived,
    "a seat nobody has used is not arrived",
  ).toBe(false);

  const student = await playwright.request.newContext();
  const signIn = await student.post("/api/auth/join-code", { data: { code: seat.joinCode } });
  expect(signIn.status()).toBe(200);

  const after = (await readOk(await admin.codeWallRaw())).data as {
    seats: { participantId: string; arrived: boolean }[];
  };
  expect(
    after.seats.find((row) => row.participantId === seat.participantId)?.arrived,
    "the wall marks a seat with a live session as arrived, and the screen then hides its code",
  ).toBe(true);
});

test("a revoked session puts the code back on the wall", async ({ playwright }) => {
  /*
    An organizer who revokes a session has decided that student must sign in again, so their code
    has to reappear. If "arrived" were "has ever had a session", the student would be locked out of
    a wall that no longer shows them anything.
  */
  const seat = await newSeat("Revoked Wall");
  const student = await playwright.request.newContext();
  await student.post("/api/auth/join-code", { data: { code: seat.joinCode } });

  await testDb().session.updateMany({
    where: { participantId: seat.participantId },
    data: { revokedAt: new Date(), revokedReason: "e2e: code wall" },
  });

  const wall = (await readOk(await admin.codeWallRaw())).data as {
    seats: { participantId: string; arrived: boolean }[];
  };
  expect(wall.seats.find((row) => row.participantId === seat.participantId)?.arrived).toBe(false);
});

test("it counts the seats that have no code yet", async () => {
  // The organizer has to mint codes before projecting anything, and the screen says how many are
  // missing rather than quietly showing a short wall.
  const nameless = await testDb().participant.create({
    data: {
      contestId,
      displayName: `E2E No Code ${String(Date.now())}`,
      userId: null,
    },
    select: { id: true },
  });
  try {
    const wall = (await readOk(await admin.codeWallRaw())).data as { seatsWithoutCode: number };
    expect(wall.seatsWithoutCode).toBeGreaterThanOrEqual(1);
  } finally {
    await testDb().participant.delete({ where: { id: nameless.id } });
  }
});

test("a competitor cannot read the wall, and neither can a stranger", async ({ playwright }) => {
  const seat = await newSeat("Nosy Wall");

  const studentContext = await playwright.request.newContext();
  await studentContext.post("/api/auth/join-code", { data: { code: seat.joinCode } });
  const student = new ContestApi(studentContext, contestId);
  const asStudent = await readEnvelope(await student.codeWallRaw());
  expect(asStudent.status, "a signed-in student must not read the roster's codes").toBe(403);

  const stranger = new ContestApi(await playwright.request.newContext(), contestId);
  const asStranger = await readEnvelope(await stranger.codeWallRaw());
  expect(asStranger.status).toBeGreaterThanOrEqual(400);
  expect(asStranger.status).toBeLessThan(500);
});

test("the wall page itself bounces anybody who is not an organizer", async ({ playwright }) => {
  // The page is OUTSIDE /admin, so the layout gate does not cover it and it does the check itself.
  // That check is the only thing between this URL and every code in the contest.
  const stranger = await playwright.request.newContext();
  const response = await stranger.get(`/wall/${contestId}`, { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toContain("/sign-in");
});
