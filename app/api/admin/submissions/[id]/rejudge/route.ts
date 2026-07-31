import type { NextResponse } from "next/server";

import { AdminReasonSchema, SubmissionViewSchema } from "@/lib/schemas/api";
import { rejudgeSubmission } from "@/lib/contest/admin";
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
 * `POST /api/admin/submissions/{id}/rejudge` — run a submission through the judge again.
 *
 * A reason is required, exactly as it is for an override. Both change a student's score without
 * the student doing anything, and "why" is not optional metadata on an action like that — making
 * it a required field means the audit row cannot be written without one.
 *
 * The console offered this button before any route existed behind it: pressing it appended a line
 * to an on-screen log and requeued nothing.
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
    const { reason } = await readJson(request, AdminReasonSchema);

    return jsonOk(
      SubmissionViewSchema.parse(await rejudgeSubmission(id, reason, admin, now)),
      NO_STORE,
    );
  });
}
