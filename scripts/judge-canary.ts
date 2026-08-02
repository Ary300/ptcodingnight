import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { issueSession } from "@/lib/contest/session-store";
import { parseServerEnv } from "@/lib/schemas/env";

/**
 * The judge canary: prove the whole judging path is alive, every minute, all night.
 *
 * ## Why this exists
 *
 * The worst judge failure this project has actually had was not a crash. It was an ABSENCE: no
 * worker consuming the queue, while every observable stayed green. Images present, Redis up, the
 * API returning 200, submissions accepted. Nothing was broken; something just was not there, and
 * a process cannot log that it is not running. A submission sat for 12 minutes and the platform
 * looked fine the entire time.
 *
 * Health checks answer "is each part up". A canary answers the only question the room cares
 * about: does a submission come back judged, now? It exercises the API, the queue, the worker,
 * the container, and the verdict path in one shot, which makes it the one check that catches
 * failures nobody predicted.
 *
 * ## Why run-samples rather than a real submission
 *
 * `POST /api/run-samples` runs the full pipeline (enqueue, worker, fresh container, compare
 * against sample cases) and PERSISTS NOTHING. A canary firing every 60 seconds for three hours is
 * 180 runs; as submissions those would be rows on the board and noise in every export. As sample
 * runs they leave no trace, and the path they exercise is the same one a real submission takes.
 * What they skip is only the verdict writeback, which is a Postgres UPDATE the rest of the
 * platform exercises constantly.
 *
 * ## Usage
 *
 *   npx tsx scripts/judge-canary.ts --once          one probe; exit 0 healthy, 1 not
 *   npx tsx scripts/judge-canary.ts                 loop forever, one probe a minute, log a line
 *                                                   each time; exits 1 on the first failure so a
 *                                                   supervisor (launchd, systemd, a shell loop)
 *                                                   can alarm on process death
 *   BASE_URL=https://ptcodingnight.com npx tsx ...  probe production instead of localhost
 *
 * On contest night: start it an hour before doors, wired to whatever makes noise (a terminal on
 * the organizer's laptop is enough; the failure line says what to check first).
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PROBE_INTERVAL_MS = 60_000;
/** A healthy probe is seconds. 30s of silence means the path is down in a way worth a human. */
const PROBE_TIMEOUT_MS = 30_000;

/** Correct for any "read numbers, print their sum" sample; harmless everywhere else. */
const CANARY_SOURCE = [
  "import sys",
  "data = sys.stdin.read().split()",
  "print(sum(int(x) for x in data))",
  "",
].join("\n");

interface Probe {
  readonly token: string;
  readonly contestProblemId: string;
  readonly slug: string;
}

/**
 * Mint a short-lived competitor session and pick a judgeable problem.
 *
 * Direct database access, because the canary runs on a host that has it (the judge host), and a
 * canary that depended on a user account would fail when that account was touched, which is a
 * false alarm waiting for the busiest possible moment.
 */
async function prepareProbe(): Promise<Probe> {
  const env = parseServerEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    /*
      Find a WORKABLE PAIR, not the first participant. The first draft fixed the participant and
      then looked for a problem they could see, and its very first live run failed: the oldest
      participant on this machine sat in a leftover audit contest whose problems did not match
      their set. A canary that false-alarms on its own pick is worse than no canary, so the search
      walks candidates until a (participant, sample-bearing problem) pair exists, and only then
      gives up.
    */
    // The WINDOW is part of viability, not just the state: the gate refuses submissions outside
    // startsAt..endsAt however RUNNING the state column says the contest is, and the second live
    // run of this script found exactly that pair (a running contest whose window had expired) and
    // false-alarmed with a 409.
    const now = new Date();
    const candidates = await prisma.participant.findMany({
      where: {
        contest: {
          state: { in: ["RUNNING", "FROZEN"] },
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
      },
      orderBy: { joinedAt: "asc" },
      take: 25,
      select: { id: true, displayName: true, contestId: true, chosenSetId: true },
    });
    if (candidates.length === 0) {
      throw new Error("no participant in any RUNNING or FROZEN contest to probe as");
    }

    let participant: (typeof candidates)[number] | null = null;
    let contestProblem: { id: string; problem: { slug: string } } | null = null;
    for (const candidate of candidates) {
      const found = await prisma.contestProblem.findFirst({
        where: {
          contestId: candidate.contestId,
          OR: [{ setId: null }, { setId: candidate.chosenSetId }],
          problem: { state: "PUBLISHED", testCases: { some: { isSample: true } } },
        },
        select: { id: true, problem: { select: { slug: true } } },
      });
      if (found !== null) {
        participant = candidate;
        contestProblem = found;
        break;
      }
    }
    if (participant === null || contestProblem === null) {
      throw new Error(
        "no (participant, sample-bearing problem) pair in any RUNNING or FROZEN contest",
      );
    }

    const session = await issueSession(
      {
        role: "COMPETITOR",
        method: "GOOGLE",
        displayName: participant.displayName,
        participantId: participant.id,
        contestId: participant.contestId,
        // One hour: long enough for a night of probes from one mint, short enough to be inert.
        maxAgeMs: 60 * 60 * 1000,
      },
      new Date(),
    );

    return {
      token: session.token,
      contestProblemId: contestProblem.id,
      slug: contestProblem.problem.slug,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function probeOnce(probe: Probe): Promise<{ ok: boolean; ms: number; detail: string }> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/api/run-samples`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `ptcn_session=${probe.token}`,
      },
      body: JSON.stringify({
        contestProblemId: probe.contestProblemId,
        language: "PYTHON_312",
        sourceCode: CANARY_SOURCE,
      }),
      signal: controller.signal,
    });

    const ms = Date.now() - startedAt;
    if (!response.ok) {
      return { ok: false, ms, detail: `HTTP ${String(response.status)} from run-samples` };
    }

    const body: unknown = await response.json();
    const results =
      typeof body === "object" && body !== null && "data" in body
        ? (body as { data: { results?: unknown[] } }).data.results
        : undefined;
    if (!Array.isArray(results) || results.length === 0) {
      return { ok: false, ms, detail: "run-samples returned no results" };
    }
    return { ok: true, ms, detail: `${String(results.length)} sample(s) judged` };
  } catch (error) {
    const ms = Date.now() - startedAt;
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      ms,
      detail: aborted
        ? `no verdict within ${String(PROBE_TIMEOUT_MS)} ms. Check, in order: is the worker ` +
          `running (pgrep -f worker/index.ts, or the compose worker service); is Docker up; ` +
          `is the queue draining (admin console, judge health)`
        : `probe failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function logLine(ok: boolean, ms: number, detail: string, slug: string): void {
  console.log(
    JSON.stringify({
      level: ok ? "info" : "error",
      event: ok ? "canary.ok" : "canary.FAILED",
      target: BASE_URL,
      slug,
      ms,
      detail,
      at: new Date().toISOString(),
    }),
  );
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const probe = await prepareProbe();

  for (;;) {
    const result = await probeOnce(probe);
    logLine(result.ok, result.ms, result.detail, probe.slug);

    if (!result.ok) process.exit(1);
    if (once) process.exit(0);

    await new Promise((resolve) => setTimeout(resolve, PROBE_INTERVAL_MS));
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "canary.FAILED",
      detail: error instanceof Error ? error.message : String(error),
      at: new Date().toISOString(),
    }),
  );
  process.exit(1);
});
