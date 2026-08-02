import { expect, test } from "@playwright/test";

import type { SetPlanResponse } from "@/lib/schemas/api";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb } from "./helpers/seed";

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

test.describe.configure({ mode: "serial" });

let draftId = "";
let admin: ContestApi;

test.beforeAll(async ({ playwright }) => {
  await seedE2EContest();

  const bootstrap = new ContestApi(await playwright.request.newContext(), "unused");
  await bootstrap.adminLogin(ADMIN_PASSCODE);
  const created = await readOk(
    await bootstrap.createContestRaw({
      name: `E2E Set Preview ${Date.now()}`,
      startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
      freezeAt: null,
      scoringPresetId: "classic",
      divisions: ["Open"],
    }),
  );
  draftId = (created.data as { contestId: string }).contestId;

  admin = new ContestApi(await playwright.request.newContext(), draftId);
  await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  if (draftId !== "") await testDb().contest.delete({ where: { id: draftId } }).catch(() => null);
  await closeTestDb();
});

test("Build refuses when the usable problem bank changed after the preview", async () => {
  const previewResponse = await readOk(
    await admin.planSetsRaw({
      mode: "preview",
      composition: [{ difficulty: "E", count: 1 }],
      setCount: 1,
      seed: "e2e-preview-seed",
    }),
  );
  expect(previewResponse.status).toBe(200);
  const preview = previewResponse.data as SetPlanResponse;
  expect(preview.plan.ok).toBe(true);
  if (!preview.plan.ok) throw new Error(preview.plan.message);

  const chosen = preview.plan.sets[0]?.problems[0];
  expect(chosen).toBeDefined();
  if (chosen === undefined) throw new Error("The preview did not contain an Easy problem.");

  const original = await testDb().problem.findUniqueOrThrow({
    where: { id: chosen.problemId },
    select: { title: true },
  });
  await testDb().problem.update({
    where: { id: chosen.problemId },
    data: { title: `${original.title} (changed after preview)` },
  });

  try {
    const refusal = await readEnvelope(
      await admin.planSetsRaw({
        mode: "apply",
        composition: preview.composition,
        setCount: preview.setCount,
        seed: preview.seed ?? undefined,
        poolVersion: preview.poolVersion,
      }),
    );

    expect(refusal.status).toBe(409);
    expect(refusal.code).toBe("CONFLICT");
    expect(refusal.message).toContain("Preview the sets again");
    expect(await testDb().contestProblem.count({ where: { contestId: draftId } })).toBe(0);
  } finally {
    await testDb().problem.update({
      where: { id: chosen.problemId },
      data: { title: original.title },
    });
  }
});
