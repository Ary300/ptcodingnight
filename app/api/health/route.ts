import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { NO_STORE } from "@/lib/contest/http";

/**
 * `GET /api/health` — is this instance actually able to serve a contest?
 *
 * Used by the container healthcheck, by Caddy, and by `scripts/smoke-prod.sh`. It exists because
 * "the process is running" and "the platform works" are different claims, and a restart loop that
 * reports itself healthy is worse than one that reports itself down.
 *
 * ## What it checks, and what it deliberately does not
 *
 * It pings **Postgres**, because everything the app does needs it and a web container that comes
 * up before the database is the normal startup race.
 *
 * It does **not** ping Redis or the judge. That is not an oversight: the judge queue can be down
 * — the worker restarting, images being rebuilt — while the site is entirely usable for reading
 * problems, watching the board, and signing in. Failing this endpoint for that would take the
 * whole site out of the load balancer to fix a partial outage, at the exact moment an organizer
 * needs the board on the wall. Queue depth belongs on the admin console, where a human can decide.
 *
 * ## What it does not say
 *
 * Nothing about versions, hostnames, migrations or connection strings. This route is public and
 * unauthenticated, so it answers exactly one question — yes or no — and volunteers nothing that
 * helps someone map the deployment.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    // The cheapest round trip that proves a real connection rather than a pool that has not
    // tried yet. A `SELECT 1` fails the same way a real query would.
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    // Deliberately no detail. The operator reads `docker compose logs`; the internet reads 503.
    return NextResponse.json(
      { ok: false, database: false },
      { ...NO_STORE, status: 503 },
    );
  }

  return NextResponse.json({ ok: true, database: true }, { ...NO_STORE, status: 200 });
}
