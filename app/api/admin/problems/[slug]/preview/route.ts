import type { NextResponse } from "next/server";
import { z } from "zod";

import { problemPreview } from "@/lib/contest/problem-author";
import { NO_STORE, handle, jsonOk, readParams } from "@/lib/contest/http";
import { AdminProblemPreviewSchema } from "@/lib/schemas/api";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/admin/problems/{slug}/preview` — the statement and samples of one question.
 *
 * Exists so an organizer building a line-up can read a question before adding it. Admin-only,
 * and samples only: hidden test data never crosses this boundary either (PRD §7.2), so the
 * preview shows exactly what a student would eventually see and nothing more.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ slug: z.string().min(1) });

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const { slug } = await readParams(context.params, ParamsSchema);
    requireAdmin(await viewerFromRequest(request, new Date()));

    return jsonOk(AdminProblemPreviewSchema.parse(await problemPreview(slug)), NO_STORE);
  });
}
