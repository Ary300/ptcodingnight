import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

async function migration(name: string): Promise<string> {
  return readFile(join(process.cwd(), "prisma", "migrations", name, "migration.sql"), "utf8");
}

describe("data-preserving upgrade migrations", () => {
  it("repairs the old null-set inference only for provably historical contests", async () => {
    const sql = await migration("20260802035000_repair_historical_contest_problem_round");

    expect(sql).toContain('c."createdAt" <= migration."finished_at"');
    expect(sql).toContain("20260731000000_team_scoring_and_auth");
    expect(sql).toContain("contest.problems_set");
    expect(sql).toContain('NOT EXISTS (\n    SELECT 1\n    FROM "ProblemSet"');
  });

  it("merges callback-race duplicates before adding participant uniqueness", async () => {
    const cleanupSql = await migration("20260802025000_merge_duplicate_participants");
    const indexSql = await migration("20260802030000_unique_participant_user_per_contest");
    const cleanup = cleanupSql.indexOf('DELETE FROM "Participant"');
    const preflight = cleanupSql.indexOf("duplicate signed-in participants remain");
    const uniqueIndex = indexSql.indexOf(
      'CREATE UNIQUE INDEX "Participant_contestId_userId_key"',
    );

    expect("20260802025000_merge_duplicate_participants" < "20260802030000_unique_participant_user_per_contest").toBe(true);
    expect(cleanup).toBeGreaterThan(-1);
    expect(preflight).toBeGreaterThan(cleanup);
    expect(uniqueIndex).toBeGreaterThan(-1);
  });

  it("deduplicates a whole hint collision group before reparenting its survivor", async () => {
    const sql = await migration("20260802025000_merge_duplicate_participants");
    const cleanup = sql.indexOf('DELETE FROM "Participant"');
    const rankCollision = sql.indexOf('PARTITION BY\n        normalized."canonicalId"');
    const deleteCollisions = sql.indexOf('merge."rowNumber" > 1');
    const reparentSurvivor = sql.indexOf('merge."rowNumber" = 1');

    expect(rankCollision).toBeGreaterThan(-1);
    expect(deleteCollisions).toBeGreaterThan(rankCollision);
    expect(reparentSurvivor).toBeGreaterThan(deleteCollisions);
    expect(cleanup).toBeGreaterThan(reparentSurvivor);
  });
});
