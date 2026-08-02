import { expect, test } from "@playwright/test";

import { requiredEnv } from "./helpers/env";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * The browser path from an empty authoring form to a real question in the bank.
 *
 * The domain functions already validate authored questions, but this is the only proof that the
 * three-step screen keeps its values, posts the shape the API expects, follows the successful
 * redirect, and exposes the created question to an organizer. Every record this spec creates is
 * removed through the real DELETE route, which removes its test files as well as its database row.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const TITLE_PREFIX = "E2E Authored Question ";

test.describe.configure({ timeout: 120_000 });

test.afterAll(async () => {
  await closeTestDb();
});

test("an organizer previews and creates a coding question", async ({ page }, testInfo) => {
  const title = `${TITLE_PREFIX}${testInfo.project.name} ${String(Date.now())}`;
  let createdSlug: string | null = null;
  let historyContestId: string | null = null;

  const login = await page.request.post("/api/admin/session", {
    data: { passcode: ADMIN_PASSCODE },
  });
  expect(login.ok(), "the organizer session could not be created").toBe(true);

  try {
    await page.goto("/admin/problems/new");
    await expect(
      page.getByRole("heading", { level: 1, name: "Create a coding question" }),
    ).toBeVisible();

    await page.getByLabel("Question name").fill(title);
    await page
      .getByLabel("Problem statement")
      .fill("Read two integers from standard input and print their sum.");

    await page.getByRole("button", { name: "Preview question" }).click();
    const preview = page.getByRole("dialog", { name: "Question preview" });
    await expect(preview.getByRole("heading", { name: title })).toBeVisible();
    await expect(preview).toContainText("Read two integers");
    await preview.getByRole("button", { name: "Close preview" }).click();

    await page.getByRole("button", { name: "Next: Starter code" }).click();
    await expect(page.getByRole("heading", { name: "Function declaration" })).toBeVisible();
    await page.getByRole("button", { name: "Next: Test cases" }).click();

    await page.getByLabel("Input (stdin)").fill("2 3");
    await page.getByLabel("Expected output (stdout)").fill("5");
    await expect(page.getByRole("button", { name: "Create question" })).toBeEnabled();

    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/admin/problems",
    );
    await page.getByRole("button", { name: "Create question" }).click();
    const response = await responsePromise;
    expect(response.status(), "the create-question API refused the form").toBe(200);

    const body: unknown = await response.json();
    const data =
      typeof body === "object" && body !== null && "data" in body
        ? (body as { data: unknown }).data
        : null;
    createdSlug =
      typeof data === "object" &&
      data !== null &&
      "slug" in data &&
      typeof (data as { slug: unknown }).slug === "string"
        ? (data as { slug: string }).slug
        : null;
    expect(createdSlug, "the create response did not name the new question").not.toBeNull();

    await page.waitForURL("**/admin/problems");
    await expect(page.getByRole("link", { name: title })).toBeVisible();

    const storedProblem = await testDb().problem.findUniqueOrThrow({
      where: { slug: createdSlug ?? "" },
      select: { id: true, statementMd: true },
    });
    const historyContest = await testDb().contest.create({
      data: {
        name: `E2E Author History ${String(Date.now())}`,
        joinCode: `AH${String(Date.now())}`,
        state: "ENDED",
        startsAt: new Date(Date.now() - 2 * 60 * 60_000),
        endsAt: new Date(Date.now() - 60 * 60_000),
      },
      select: { id: true },
    });
    historyContestId = historyContest.id;
    const contestProblem = await testDb().contestProblem.create({
      data: {
        contestId: historyContest.id,
        problemId: storedProblem.id,
        round: "GROUP",
        setId: null,
        slotLabel: "Group 1",
        basePoints: 100,
      },
      select: { id: true },
    });
    const participant = await testDb().participant.create({
      data: { contestId: historyContest.id, displayName: `Author History ${String(Date.now())}` },
      select: { id: true },
    });
    await testDb().submission.create({
      data: {
        participantId: participant.id,
        contestProblemId: contestProblem.id,
        language: "PYTHON_312",
        sourceCode: "print(5)",
      },
    });

    // An ended contest is still history. The screen refuses before an organizer spends time in
    // the editor, and the API repeats the rule for callers that bypass that screen.
    await page.goto(`/admin/problems/${encodeURIComponent(createdSlug ?? "")}/edit`);
    await expect(
      page.getByRole("heading", { name: "This question already has submissions" }),
    ).toBeVisible();
    const edit = await page.request.patch(
      `/api/admin/problems/${encodeURIComponent(createdSlug ?? "")}`,
      {
        data: {
          title,
          statementMd: "This rewrite must be refused.",
          difficulty: "E",
          testCases: [{ input: "2 3", expectedOutput: "5", isSample: true }],
        },
      },
    );
    expect(edit.status()).toBe(409);
    expect(
      (
        await testDb().problem.findUniqueOrThrow({
          where: { id: storedProblem.id },
          select: { statementMd: true },
        })
      ).statementMd,
    ).toBe(storedProblem.statementMd);
  } finally {
    if (historyContestId !== null) {
      await testDb().contest.deleteMany({ where: { id: historyContestId } });
    }
    // If the browser failed after the server committed but before it parsed the response, recover
    // the exact slug by this test's unique title so no authored files or rows are left behind.
    const stored =
      createdSlug === null
        ? await testDb().problem.findFirst({ where: { title }, select: { slug: true } })
        : null;
    const slug = createdSlug ?? stored?.slug ?? null;
    if (slug !== null) {
      const cleanup = await page.request.delete(
        `/api/admin/problems/${encodeURIComponent(slug)}`,
        { data: { confirmTitle: title } },
      );
      expect(cleanup.ok(), `temporary authored question ${slug} was not removed`).toBe(true);
    }
  }
});
