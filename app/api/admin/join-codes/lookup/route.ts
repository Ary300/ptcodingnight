import type { NextResponse } from "next/server";

import { whoseJoinCode } from "@/lib/contest/join-code";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import { AdminWhoseCodeRequestSchema, AdminWhoseCodeResponseSchema } from "@/lib/schemas/api";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/admin/join-codes/lookup` — whose slip is this?
 *
 * The question a team prefix inside the code was going to answer. Answering it here instead keeps
 * the code opaque: a prefix would bake the team into a string that cannot change while the team
 * itself can, and the first roster reshuffle would make every printed code a lie.
 *
 * Admin-only, and it signs nobody in: it reads a seat, it does not open one.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    requireAdmin(await viewerFromRequest(request, new Date()));
    const input = await readJson(request, AdminWhoseCodeRequestSchema);

    return jsonOk(AdminWhoseCodeResponseSchema.parse(await whoseJoinCode(input.code)), NO_STORE);
  });
}
