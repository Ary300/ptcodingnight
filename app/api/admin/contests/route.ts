import type { NextResponse } from "next/server";

import { AdminContestListSchema } from "@/lib/schemas/api";
import { NO_STORE, handle, jsonOk } from "@/lib/contest/http";
import { listContestsForAdmin } from "@/lib/contest/contests";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/admin/contests` — every contest an organizer can act on, newest first.
 *
 * ## Why this exists
 *
 * `/admin/teams` and `/admin/side-activities` are both pinned to a contest by query string,
 * deliberately: there is no implicit "current contest" anywhere in this application, because that
 * is hidden state that breaks the moment two contests exist or somebody opens last year's board.
 *
 * The consequence went unnoticed, though. With nothing to enumerate contests, an organizer who
 * clicked "Teams" in the nav was told to add `?contest=<id>` to the URL — an id only obtainable
 * from `psql`. The roster screen was, in practice, unreachable, and a roster is a SCORING INPUT:
 * team size is the divisor in every team score. The rule was right; it needed a picker, not an
 * exception.
 *
 * ## What it counts, and why the counts are computed rather than stored
 *
 * `participantCount` and `teamCount` come from the rows themselves. A stored count is a second
 * source of truth that drifts from the thing it describes, and the drift here would be silent and
 * would misreport the divisor.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    requireAdmin(await viewerFromRequest(request, new Date()));
    return jsonOk(AdminContestListSchema.parse(await listContestsForAdmin()), NO_STORE);
  });
}
