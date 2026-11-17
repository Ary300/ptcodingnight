import type { NextResponse } from "next/server";

import { handle } from "@/lib/contest/http";
import { studentAccountsClosed } from "@/lib/contest/accounts-closed";

/**
 * `POST /api/auth/signup` — closed. Always 410.
 *
 * It created a competitor account and enrolled it into the open contest in one submit, so anyone
 * with the URL could add themselves to the real contest once it was SCHEDULED. The organizers
 * decided on join codes only, with no student accounts, so the route answers 410 with a sentence
 * pointing to `/join`. It reads nothing and creates nothing.
 *
 * Kept as a route rather than deleted so a stale client gets a sentence it can show instead of
 * Next's HTML 404.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  return handle(async () => {
    throw studentAccountsClosed();
  });
}
