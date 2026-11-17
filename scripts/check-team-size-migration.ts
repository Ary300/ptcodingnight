/**
 * Replays `20261117120000_team_size_four` against a SCRATCH database and checks what it moved.
 *
 *   SCRATCH_DATABASE_URL=postgresql://ptcn:...@localhost:5432/postgres \
 *     npx tsx scripts/check-team-size-migration.ts
 *
 * A static read of the SQL (tests/unit/migration-safety.test.ts) proves the guard is written
 * down. Only Postgres proves it does what it says, so this creates a throwaway database, applies
 * every migration up to and including the team-size-five one, plants contests in the states the
 * new migration has to tell apart, applies it, reads the result, and drops the database. It never
 * touches the database in `DATABASE_URL`.
 *
 * `SCRATCH_DATABASE_URL` names any database on the server (the scratch one is created beside it);
 * it falls back to `DATABASE_URL`'s server.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { Client } from "pg";
import { z } from "zod";

const TARGET = "20261117120000_team_size_four";
const MIGRATIONS = join(process.cwd(), "prisma", "migrations");

const Env = z
  .object({
    SCRATCH_DATABASE_URL: z.string().url().optional(),
    DATABASE_URL: z.string().url().optional(),
  })
  .refine((env) => env.SCRATCH_DATABASE_URL !== undefined || env.DATABASE_URL !== undefined, {
    message: "Set SCRATCH_DATABASE_URL (or DATABASE_URL) to a Postgres server this may create a database on",
  });

interface Planted {
  readonly id: string;
  readonly state: "DRAFT" | "SCHEDULED" | "RUNNING" | "FROZEN" | "ENDED";
  readonly maxTeamSize: number;
  /** Member count per team. */
  readonly teams: readonly number[];
  readonly expected: number;
  readonly why: string;
}

const PLANTED: readonly Planted[] = [
  { id: "draft-fours", state: "DRAFT", maxTeamSize: 5, teams: [4, 3], expected: 4, why: "DRAFT at 5, no team over 4" },
  { id: "draft-five", state: "DRAFT", maxTeamSize: 5, teams: [5, 2], expected: 5, why: "DRAFT at 5 with a team of 5 is left alone" },
  { id: "scheduled-empty", state: "SCHEDULED", maxTeamSize: 5, teams: [], expected: 4, why: "SCHEDULED at 5, no teams" },
  { id: "running-fours", state: "RUNNING", maxTeamSize: 5, teams: [4, 4, 4], expected: 4, why: "RUNNING at 5, teams of 4" },
  { id: "frozen-split", state: "FROZEN", maxTeamSize: 5, teams: [3, 2], expected: 4, why: "FROZEN: five players over two teams is not a team of five" },
  { id: "ended-five", state: "ENDED", maxTeamSize: 5, teams: [2], expected: 5, why: "ENDED is history" },
  { id: "draft-three", state: "DRAFT", maxTeamSize: 3, teams: [3], expected: 3, why: "an organizer's 3 is not the old default" },
];

function urlFor(base: string, database: string): string {
  const url = new URL(base);
  url.pathname = `/${database}`;
  url.search = "";
  return url.toString();
}

async function migrationsThrough(name: string): Promise<string[]> {
  const entries = await readdir(MIGRATIONS, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name <= name)
    .map((entry) => entry.name)
    .sort();
}

/**
 * Prisma's own bookkeeping table, in the shape `migrate deploy` creates. One earlier migration
 * reads it (it repairs only contests created before a named migration finished), so a replay
 * without it fails on that file rather than on the one under test.
 */
const PRISMA_MIGRATIONS_TABLE = `
CREATE TABLE "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

async function apply(client: Client, name: string): Promise<void> {
  // The simple query protocol runs a multi-statement file as one batch, as `migrate deploy` does.
  await client.query(await readFile(join(MIGRATIONS, name, "migration.sql"), "utf8"));
  await client.query(
    `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count")
     VALUES (gen_random_uuid()::text, 'replay', clock_timestamp(), $1, 1)`,
    [name],
  );
}

async function plant(client: Client): Promise<void> {
  for (const contest of PLANTED) {
    await client.query(
      `INSERT INTO "Contest" ("id", "name", "startsAt", "endsAt", "state", "joinCode", "maxTeamSize", "updatedAt")
       VALUES ($1, $1, now(), now() + interval '1 hour', $2::"ContestState", $1, $3, now())`,
      [contest.id, contest.state, contest.maxTeamSize],
    );
    for (const [t, size] of contest.teams.entries()) {
      const teamId = `${contest.id}-t${String(t)}`;
      await client.query(
        `INSERT INTO "Team" ("id", "contestId", "name", "joinCode") VALUES ($1, $2, $1, $1)`,
        [teamId, contest.id],
      );
      for (let m = 0; m < size; m += 1) {
        const participantId = `${teamId}-p${String(m)}`;
        await client.query(
          `INSERT INTO "Participant" ("id", "contestId", "displayName", "teamId") VALUES ($1, $2, $1, $3)`,
          [participantId, contest.id, teamId],
        );
      }
    }
  }
}

async function main(): Promise<number> {
  const env = Env.parse(process.env);
  const base = env.SCRATCH_DATABASE_URL ?? env.DATABASE_URL ?? "";
  const scratch = `ptcn_migcheck_${String(Date.now())}`;

  const admin = new Client({ connectionString: base });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${scratch}"`);
  let failures = 0;
  try {
    const db = new Client({ connectionString: urlFor(base, scratch) });
    await db.connect();
    try {
      await db.query(PRISMA_MIGRATIONS_TABLE);
      const before = (await migrationsThrough(TARGET)).filter((name) => name !== TARGET);
      for (const name of before) await apply(db, name);
      console.log(`applied ${String(before.length)} migrations through ${before.at(-1) ?? "none"}`);

      await plant(db);
      await apply(db, TARGET);
      console.log(`applied ${TARGET}`);

      const rows = await db.query<{ id: string; maxTeamSize: number }>(
        `SELECT "id", "maxTeamSize" FROM "Contest" ORDER BY "id"`,
      );
      const actual = new Map(rows.rows.map((row) => [row.id, row.maxTeamSize]));
      for (const contest of PLANTED) {
        const got = actual.get(contest.id);
        const ok = got === contest.expected;
        if (!ok) failures += 1;
        console.log(
          `${ok ? "PASS" : "FAIL"}  ${contest.id.padEnd(16)} ${contest.state.padEnd(9)} ` +
            `${String(contest.maxTeamSize)} -> ${String(got)} (expected ${String(contest.expected)}): ${contest.why}`,
        );
      }

      await db.query(
        `INSERT INTO "Contest" ("id", "name", "startsAt", "endsAt", "joinCode", "updatedAt")
         VALUES ('fresh', 'fresh', now(), now(), 'fresh', now())`,
      );
      const fresh = await db.query<{ maxTeamSize: number }>(
        `SELECT "maxTeamSize" FROM "Contest" WHERE "id" = 'fresh'`,
      );
      const freshSize = fresh.rows[0]?.maxTeamSize;
      const freshOk = freshSize === 4;
      if (!freshOk) failures += 1;
      console.log(`${freshOk ? "PASS" : "FAIL"}  a new contest takes the default: ${String(freshSize)}`);
    } finally {
      await db.end();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS "${scratch}"`);
    await admin.end();
  }
  console.log(failures === 0 ? "all checks passed" : `${String(failures)} check(s) failed`);
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
