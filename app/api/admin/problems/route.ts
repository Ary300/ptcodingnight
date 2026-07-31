import type { NextResponse } from "next/server";

import { AdminProblemBankSchema } from "@/lib/schemas/api";
import { NO_STORE, handle, jsonOk } from "@/lib/contest/http";
import { problemBank } from "@/lib/contest/problem-bank";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/admin/problems` — the problem bank.
 *
 * `/admin/problems` rendered twelve hardcoded fixtures while the database held 130 real problems,
 * under a header claiming "125 problems imported from the past-contest index". Every number on
 * that screen described a fixture file rather than the contest about to be run, and the problem an
 * organizer was looking for was not on it.
 *
 * Organizer-only, like everything else under /api/admin. A DRAFT problem's statement is unwritten
 * rather than secret, but the bank also names which problems were used in past contests and scored
 * nothing — which is a hint about this year's line-up.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    requireAdmin(await viewerFromRequest(request, new Date()));
    return jsonOk(AdminProblemBankSchema.parse(await problemBank()), NO_STORE);
  });
}
