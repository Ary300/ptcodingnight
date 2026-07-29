import type { NextResponse } from "next/server";

import { SubmitRequestSchema } from "@/lib/schemas/api";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import { createSubmission, listMySubmissions } from "@/lib/contest/submissions";
import { requireCompetitor, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/submissions` — the judged path.
 *
 * Validates, writes one row, enqueues, returns. It does **not** judge inline and it does not
 * wait: untrusted code never runs in the web process (docs/PRD.md §7.1). The verdict arrives
 * over the stream, or from `GET /api/submissions/{id}` if the stream is unavailable.
 *
 * `GET` on this collection is the caller's own submission history, and only ever their own.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const viewer = requireCompetitor(viewerFromRequest(request, now));
    const input = await readJson(request, SubmitRequestSchema);

    return jsonOk(await createSubmission(input, viewer, now), { ...NO_STORE, status: 202 });
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const viewer = requireCompetitor(viewerFromRequest(request, now));

    return jsonOk(await listMySubmissions(viewer, now), NO_STORE);
  });
}
