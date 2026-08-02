import type { NextResponse } from "next/server";

import { SetContestProblemsRequestSchema, SetContestProblemsResponseSchema } from "@/lib/schemas/api";
import { setContestProblems } from "@/lib/contest/contests";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readJson,
  readParams,
} from "@/lib/contest/http";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `PUT /api/admin/contests/{id}/problems` — set a contest's line-up.
 *
 * PUT rather than POST because it REPLACES. `ContestProblem` is unique on
 * `(contestId, problemId, divisionId)`, so an append would throw the second time an organizer
 * pressed save and leave the contest half-updated. Replacing is also what "here is the line-up"
 * means to the person doing it.
 *
 * ## Why this route did not exist, and what its absence cost
 *
 * Nothing anywhere wrote `ContestProblem`. So a contest created through the builder could never be
 * competed in — the only runnable contests were the ones `scripts/seed-demo.ts` produced, and
 * "create a contest" was a button that made a row nobody could use. The problem bank screen even
 * had an "Add to contest" control that fired no request at all.
 *
 * The whole line-up arrives in one call on purpose. Adding problems one at a time would let an
 * organizer stop halfway and publish a contest that is missing its Group problems, and there is no
 * moment at which that half-state is meaningful.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    const admin = requireAdmin(await viewerFromRequest(request, new Date()));
    const input = await readJson(request, SetContestProblemsRequestSchema);

    const result = await setContestProblems(id, input.problems, {
      actor: `admin:${admin.sessionId}`,
      reason: input.reason,
    });

    return jsonOk(SetContestProblemsResponseSchema.parse(result), NO_STORE);
  });
}
