import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { ProblemDetailSchema } from "@/lib/schemas/api";
import { SignatureSchema } from "@/lib/schemas/seed";
import { starterFor } from "@/lib/judge/starters";

import { readOk } from "./helpers/api";
import { newCompetitorContext } from "./helpers/session";
import { closeTestDb, liveProblem, repoRoot, seedE2EContest, testDb } from "./helpers/seed";

/**
 * A hand-written `content/problems/<slug>/starters/main.py` reaches the student byte for byte, and
 * the languages without a hand-written file fall back to the generated starter as before.
 *
 * Over HTTP against the real server, because the file is read from disk by the web process at
 * request time, relative to ITS working directory. A unit test with an injected root cannot prove
 * the server looks in the right place; only a request can.
 *
 * The problem and its starter folder are created for this run and removed afterwards. The slug is
 * unique per run because the server caches reads per slug: reusing a slug the server had already
 * read with no file present would make the test depend on what ran before it.
 */
test("a hand-written starter wins, and the other languages fall back to the generated one", async ({
  playwright,
  baseURL,
}) => {
  const seeded = await seedE2EContest();
  const db = testDb();
  const live = liveProblem(seeded);
  const placement = await db.contestProblem.findUniqueOrThrow({
    where: { id: live.contestProblemId },
    select: { setId: true, divisionId: true },
  });

  const slug = `e2e-starter-${String(Date.now())}`;
  const problemDir = path.join(repoRoot(), "content", "problems", slug);
  const handWritten =
    "import sys\n\n\n# Hand-written for this test: read n, then n numbers.\n" +
    "def main():\n    data = sys.stdin.read().split()\n    print(0)\n\n\nmain()\n";

  // A real signature from the bank, so the Java and C++ fallbacks are real generated starters.
  const manifest: unknown = JSON.parse(
    await readFile(path.join(repoRoot(), "content", "problems", "a-very-big-sum", "problem.json"), "utf8"),
  );
  const signature = SignatureSchema.parse(
    typeof manifest === "object" && manifest !== null && "signature" in manifest
      ? manifest.signature
      : null,
  );

  let problemId: string | null = null;
  let contestProblemId: string | null = null;
  try {
    await mkdir(path.join(problemDir, "starters"), { recursive: true });
    await writeFile(path.join(problemDir, "starters", "main.py"), handWritten);

    const problem = await db.problem.create({
      data: {
        slug,
        title: "E2E Hand Starter",
        statementMd: "Print the sum.",
        inputSpec: "n, then n numbers.",
        outputSpec: "Their sum.",
        constraints: "",
        difficulty: "E",
        state: "PUBLISHED",
        type: "ALGORITHM",
        timeLimitMs: 2000,
        memoryLimitMb: 256,
        allowedLanguages: ["PYTHON_312", "JAVA_21", "CPP_17"],
        signature,
      },
      select: { id: true },
    });
    problemId = problem.id;

    const contestProblem = await db.contestProblem.create({
      data: {
        contestId: seeded.contestId,
        problemId,
        divisionId: placement.divisionId,
        setId: placement.setId,
        slotLabel: "Hand starter",
        basePoints: 100,
      },
      select: { id: true },
    });
    contestProblemId = contestProblem.id;

    const competitor = await newCompetitorContext(playwright, seeded.contestId, {
      divisionId: placement.divisionId,
      chosenSetId: placement.setId,
      baseURL,
    });
    try {
      const response = await competitor.request.get(
        `/api/contests/${seeded.contestId}/problems/${slug}`,
      );
      const { status, data } = await readOk(response);
      expect(status, JSON.stringify(data)).toBe(200);
      const detail = ProblemDetailSchema.parse(data);

      expect(detail.starters).toEqual([
        { language: "PYTHON_312", code: handWritten },
        { language: "JAVA_21", code: starterFor(signature, "JAVA_21") },
        { language: "CPP_17", code: starterFor(signature, "CPP_17") },
      ]);
    } finally {
      await competitor.request.dispose();
    }
  } finally {
    await rm(problemDir, { recursive: true, force: true });
    if (contestProblemId !== null) {
      await db.contestProblem.delete({ where: { id: contestProblemId } });
    }
    if (problemId !== null) await db.problem.delete({ where: { id: problemId } });
    await closeTestDb();
  }
});
