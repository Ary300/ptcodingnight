import { expect, test } from "@playwright/test";

import { AdminRosterSchema, type SetPlanResponse } from "@/lib/schemas/api";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb } from "./helpers/seed";

/**
 * G7 — roster changes after the sets are dealt and the slips are printed.
 *
 * Found by building a 35-seat, two-division night through the Teams tab:
 *
 *  1. A student added at the door with "Add and make a code", straight onto a team, got NO set.
 *     The seat signed in to an empty problem list, and the only remedy on screen was re-dealing
 *     everyone, which changes the letter printed on every slip.
 *  2. The "Choose set" picker listed "Set A" once per division with nothing to tell them apart,
 *     and the server accepted the other division's set, handing the student the other division's
 *     problems while the teammate check (which compares set ids) saw no clash.
 *
 * Every assertion reads the roster the organizer's screen reads.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

test.describe.configure({ mode: "serial" });

let contestId = "";
let admin: ContestApi;
let intermediateId = "";
let advancedId = "";
let teamId = "";

async function roster() {
  const body = await readOk(await admin.rosterRaw());
  return AdminRosterSchema.parse(body.data);
}

test.beforeAll(async ({ playwright }) => {
  await seedE2EContest();

  const bootstrap = new ContestApi(await playwright.request.newContext(), "unused");
  await bootstrap.adminLogin(ADMIN_PASSCODE);
  const created = await readOk(
    await bootstrap.createContestRaw({
      name: `E2E Late Arrival ${String(Date.now())}`,
      startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
      freezeAt: null,
      scoringPresetId: "classic",
      divisions: ["Intermediate", "Advanced"],
    }),
  );
  contestId = (created.data as { contestId: string }).contestId;
  admin = new ContestApi(await playwright.request.newContext(), contestId);
  await admin.adminLogin(ADMIN_PASSCODE);

  const divisions = (await roster()).divisions;
  intermediateId = divisions.find((d) => d.name === "Intermediate")?.divisionId ?? "";
  advancedId = divisions.find((d) => d.name === "Advanced")?.divisionId ?? "";
  expect(intermediateId).not.toBe("");
  expect(advancedId).not.toBe("");

  const team = await readOk(
    await admin.createTeamAsAdminRaw({ name: "Late Table", divisionId: intermediateId }),
  );
  teamId = (team.data as { teamId: string }).teamId;

  for (const name of ["Ada First", "Ben Second"]) {
    await readOk(await admin.addNamedParticipantRaw({ displayName: name, teamId }));
  }

  // Three sets per division, one Easy each: enough for a third teammate, not a fourth.
  const preview = await readOk(
    await admin.planSetsRaw({
      mode: "preview",
      composition: [{ difficulty: "E", count: 1 }],
      setCount: 3,
      seed: "e2e-late-arrival",
    }),
  );
  const plan = preview.data as SetPlanResponse;
  expect(plan.plan.ok).toBe(true);
  await readOk(
    await admin.planSetsRaw({
      mode: "apply",
      composition: plan.composition,
      setCount: plan.setCount,
      seed: plan.seed ?? undefined,
      poolVersion: plan.poolVersion,
    }),
  );
  await readOk(await admin.assignSetsRaw({}));
});

test.afterAll(async () => {
  if (contestId !== "") {
    await testDb().contest.delete({ where: { id: contestId } }).catch(() => null);
  }
  await closeTestDb();
});

test("a student added onto a team after the deal gets a set no teammate holds", async () => {
  const before = await roster();
  const printed = new Map(
    before.teams.flatMap((t) => t.members.map((m) => [m.displayName, m.chosenSetLabel])),
  );
  expect([...printed.values()].every((label) => label !== null)).toBe(true);

  await readOk(await admin.addNamedParticipantRaw({ displayName: "Cal Late", teamId }));

  const after = await roster();
  const table = after.teams.find((t) => t.teamId === teamId);
  expect(table?.memberCount).toBe(3);
  const late = table?.members.find((m) => m.displayName === "Cal Late");
  expect(late?.chosenSetLabel, "the late seat must be dealt a set").not.toBeNull();
  expect(late?.divisionId).toBe(intermediateId);

  // Its set is one of its own division's, and no teammate holds it.
  const set = after.problemSets.find((s) => s.setId === late?.chosenSetId);
  expect(set?.divisionId).toBe(intermediateId);
  const letters = table?.members.map((m) => m.chosenSetLabel) ?? [];
  expect(new Set(letters).size).toBe(letters.length);

  // Nobody else's printed letter moved.
  for (const member of table?.members ?? []) {
    if (member.displayName === "Cal Late") continue;
    expect(member.chosenSetLabel).toBe(printed.get(member.displayName));
  }
});

test("a fourth member is refused outright when the team already holds every set", async () => {
  const refusal = await readEnvelope(
    await admin.addNamedParticipantRaw({ displayName: "Dee Overflow", teamId }),
  );
  expect(refusal.status).toBe(400);

  // Refused whole: no half-made seat sits on the roster without a set.
  const after = await roster();
  const everybody = [...after.teams.flatMap((t) => t.members), ...after.unassigned];
  expect(everybody.some((m) => m.displayName === "Dee Overflow")).toBe(false);
});

test("Choose set refuses a set from another division", async () => {
  const current = await roster();
  const ada = current.teams
    .flatMap((t) => t.members)
    .find((m) => m.displayName === "Ada First");
  const advancedSet = current.problemSets.find((s) => s.divisionId === advancedId);
  expect(ada).toBeDefined();
  expect(advancedSet).toBeDefined();

  const refusal = await readEnvelope(
    await admin.reassignSetRaw({
      participantId: ada?.participantId ?? "",
      setId: advancedSet?.setId ?? "",
      reason: "e2e: wrong division",
    }),
  );
  expect(refusal.status).toBe(400);

  const unchanged = (await roster()).teams
    .flatMap((t) => t.members)
    .find((m) => m.displayName === "Ada First");
  expect(unchanged?.chosenSetId).toBe(ada?.chosenSetId);
});
