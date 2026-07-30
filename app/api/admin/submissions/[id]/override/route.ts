import type { NextResponse } from "next/server";

import { OverrideVerdictRequestSchema } from "@/lib/schemas/api";
import { ValidationError } from "@/lib/errors";
import { overrideVerdict } from "@/lib/contest/admin";
import {
  NO_STORE,
  SubmissionIdParamsSchema,
  handle,
  jsonOk,
  readJson,
  readParams,
} from "@/lib/contest/http";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/admin/submissions/{id}/override` — manual verdict override.
 *
 * A reason is required by the schema and written to `AuditLog` with the before and after values
 * (docs/PRD.md §9.2). This is the only way a score changes without the judge, so it is the one
 * place a human has to say why.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, SubmissionIdParamsSchema);
    const admin = requireAdmin(await viewerFromRequest(request, now));
    const input = await readJson(request, OverrideVerdictRequestSchema);

    // The URL is the authority. A body naming a different submission is a mistake worth
    // refusing rather than resolving in either direction.
    if (input.submissionId !== id) {
      throw new ValidationError("The submission in the URL and the body do not match");
    }

    return jsonOk(await overrideVerdict(input, admin, now), NO_STORE);
  });
}
