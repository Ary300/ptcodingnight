import type { NextResponse } from "next/server";

import { validateAuthoredProblem } from "@/lib/contest/problem-author";
import { NO_STORE, handle, jsonOk, readParams } from "@/lib/contest/http";
import { ValidationReportSchema } from "@/lib/schemas/api";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";
import { z } from "zod";

/**
 * `POST /api/admin/problems/{slug}/validate` — judge the stored reference solution against
 * EVERY test case, in a real container, and stamp the problem as validated when all pass.
 *
 * The builder's "Validate question" button. Slow by nature (a compile plus every case), so the
 * UI treats it as a long press, not a keystroke; the judge worker must be up, and a queue that
 * never answers surfaces here as the same timeout a student's submission would hit.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ slug: z.string().min(1) });

export async function POST(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { slug } = await readParams(context.params, ParamsSchema);
    requireAdmin(await viewerFromRequest(request, now));

    return jsonOk(
      ValidationReportSchema.parse(await validateAuthoredProblem(slug, now)),
      NO_STORE,
    );
  });
}
