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

  it("moves the team-size default to five and lifts only live contests still on the old default", async () => {
    const sql = await migration("20261116120000_team_size_five");

    expect(sql).toContain('ALTER COLUMN "maxTeamSize" SET DEFAULT 5');
    expect(sql).toContain('WHERE "maxTeamSize" = 4');
    expect(sql).toContain("'DRAFT', 'SCHEDULED', 'RUNNING', 'FROZEN'");
    expect(sql).not.toContain("'ENDED'");
  });

  it("moves the team-size default back to four, and lowers only live contests with no team over four", async () => {
    const sql = await migration("20261117120000_team_size_four");

    // A NEW migration after the five one, which is applied and stays as it was.
    expect("20261116120000_team_size_five" < "20261117120000_team_size_four").toBe(true);
    expect(sql).toContain('ALTER COLUMN "maxTeamSize" SET DEFAULT 4');
    expect(sql).toContain('WHERE c."maxTeamSize" = 5');
    expect(sql).toContain("'DRAFT', 'SCHEDULED', 'RUNNING', 'FROZEN'");
    expect(sql).not.toContain("'ENDED'");
    expect(sql).not.toContain("'ARCHIVED'");
    // The roster guard: a contest whose roster already holds a team of five keeps 5.
    const guard = sql.indexOf("AND NOT EXISTS (");
    expect(guard).toBeGreaterThan(sql.indexOf('SET "maxTeamSize" = 4'));
    expect(sql.slice(guard)).toContain('JOIN "Participant" AS p ON p."teamId" = t."id"');
    expect(sql.slice(guard)).toContain('WHERE t."contestId" = c."id"');
    expect(sql.slice(guard)).toContain("HAVING COUNT(*) > 4");

    const schema = await readFile(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    expect(schema).toMatch(/maxTeamSize Int @default\(4\)/);
  });
});
