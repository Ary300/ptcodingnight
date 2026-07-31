import type { NextResponse } from "next/server";

import {
  AdminContestListSchema,
  CreateContestRequestSchema,
  CreateContestResponseSchema,
} from "@/lib/schemas/api";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/contest/audit";
import { createContest, listContestsForAdmin } from "@/lib/contest/contests";
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

/**
 * `POST /api/admin/contests` — create a contest.
 *
 * The other half of the screen that had none. `ContestBuilder` validated its draft against
 * `ContestDraftSchema` and then called nothing, so building a contest meant running a seed script.
 *
 * Validated twice on purpose, and the two checks are not the same check. `CreateContestRequestSchema`
 * is the SHAPE — that these fields exist and are strings of a sane length. `createContest` holds the
 * RULES — that it ends after it starts, that a freeze falls inside the window, that no two divisions
 * share a name. The first belongs at the trust boundary; the second is a fact about contests and
 * belongs with the thing that knows what a contest is.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const admin = requireAdmin(await viewerFromRequest(request, new Date()));
    const input = await readJson(request, CreateContestRequestSchema);

    const created = await createContest({
      name: input.name,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      freezeAt: input.freezeAt === null ? null : new Date(input.freezeAt),
      scoringPresetId: input.scoringPresetId,
      divisionNames: input.divisions,
    });

    await writeAudit({
      actor: `admin:${admin.sessionId}`,
      action: AUDIT_ACTIONS.contestCreate,
      entity: `Contest:${created.contestId}`,
      after: { name: input.name, startsAt: input.startsAt, endsAt: input.endsAt },
    });

    return jsonOk(CreateContestResponseSchema.parse(created), NO_STORE);
  });
}
