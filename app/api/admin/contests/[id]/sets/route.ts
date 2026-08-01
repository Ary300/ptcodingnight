import type { NextResponse } from "next/server";

import { applySets, previewSets, readSetPlan } from "@/lib/contest/set-build";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readJson,
  readParams,
} from "@/lib/contest/http";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";
import {
  SetPlanRequestSchema,
  SetPlanResponseSchema,
  StoredSetPlanResponseSchema,
} from "@/lib/schemas/api";

/**
 * `POST /api/admin/contests/{id}/sets` — plan the contest's problem sets, to a recipe.
 * `GET`  — read back the recipe that is stored and the sets it produced.
 *
 * One route with a `mode` rather than two routes, because the preview and the apply must be the
 * same computation. A preview an organizer approves and an apply that deals differently is the
 * exact failure this screen exists to prevent, and two handlers are two chances to diverge.
 *
 * **A preview returns its seed, and the apply must be given it back.** Same recipe, same pool and
 * same seed is the same split, byte for byte; omit the seed on the apply and it mints a fresh one,
 * producing a different and equally valid split from the one that was on screen. The seed is what
 * makes a disputed set explainable rather than arguable (docs/PRD.md §6.2), so it is carried
 * deliberately rather than hidden.
 *
 * A recipe the bank cannot fill comes back as a 200 with `plan.ok: false` and the exact shortfalls
 * — "12 Hard problems are needed for 4 sets and the bank has 9". That is not an error condition:
 * the organizer is mid-decision, and the arithmetic is the useful part of the answer. `applied`
 * says whether anything was written, and is never inferred from `mode`.
 *
 * Admin-only on both verbs, including the GET. The response names every problem in every set, and
 * a competitor who could read it would hold the whole room's questions before their own round.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    const admin = requireAdmin(await viewerFromRequest(request, now));
    const input = await readJson(request, SetPlanRequestSchema);

    const result =
      input.mode === "apply"
        ? await applySets(id, input.composition, input.setCount, admin, now, { seed: input.seed })
        : await previewSets(id, input.composition, input.setCount, { seed: input.seed });

    return jsonOk(SetPlanResponseSchema.parse(result), NO_STORE);
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    requireAdmin(await viewerFromRequest(request, now));

    return jsonOk(StoredSetPlanResponseSchema.parse(await readSetPlan(id)), NO_STORE);
  });
}
