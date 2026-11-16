import { expect, test } from "@playwright/test";

import { closeTestDb, testDb } from "./helpers/seed";
import { signInAsCompetitor } from "./helpers/session";

/**
 * G7 — /join tells a signed-in student who they are, links to their contest, and signs out.
 *
 * It showed the empty code form, so a student who came back to it could not tell whether they
 * were in. Read as rendered text.
 */

const CODE = "NFMJOINSI";
let contestId = "";

test.beforeAll(async () => {
  const db = testDb();
  await db.contest.deleteMany({ where: { joinCode: CODE } });
  const contest = await db.contest.create({
    data: {
      name: "E2E Join Notice Night",
      joinCode: CODE,
      state: "RUNNING",
      startsAt: new Date(Date.now() - 10 * 60_000),
      endsAt: new Date(Date.now() + 60 * 60_000),
    },
    select: { id: true },
  });
  contestId = contest.id;
});

test.afterAll(async () => {
  await testDb().contest.deleteMany({ where: { joinCode: CODE } });
  await closeTestDb();
});

test("nobody signed in sees the form and no notice", async ({ page }) => {
  await page.goto("/join");
  await expect(page.getByRole("heading", { name: "Enter your join code" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Signed in" })).toHaveCount(0);
});

test("a signed-in student sees who, a link to their contest, and can sign out", async ({
  page,
}) => {
  await signInAsCompetitor(page, contestId, { displayName: "Jo Notice" });
  await page.goto("/join");

  const notice = page.getByRole("region", { name: "Signed in" });
  await expect(notice).toBeVisible({ timeout: 30_000 });
  expect(await notice.innerText()).toContain(
    "You are signed in as Jo Notice for E2E Join Notice Night.",
  );
  await expect(notice.getByRole("link", { name: "Open the contest" })).toHaveAttribute(
    "href",
    "/contest",
  );
  // The form is still there for somebody else's code.
  await expect(page.getByRole("heading", { name: "Enter your join code" })).toBeVisible();

  await notice.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("region", { name: "Signed in" })).toHaveCount(0, {
    timeout: 30_000,
  });
  const session = await page.request.get("/api/auth/session");
  expect(JSON.stringify(await session.json())).not.toContain("Jo Notice");
});
