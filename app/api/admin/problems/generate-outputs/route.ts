import type { NextResponse } from "next/server";

import { generateExpectedOutputs } from "@/lib/contest/problem-author";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import {
  GenerateOutputsRequestSchema,
  GenerateOutputsResponseSchema,
} from "@/lib/schemas/api";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/admin/problems/generate-outputs` — run a reference solution over raw case inputs
 * and return what it printed, one output per input. Persists nothing; the builder form owns
 * the state and decides which answers to keep.
 *
 * The oracle direction matters: the author writes inputs, the reference produces the expected
 * outputs, and hand-typing what a program would print is how wrong expectations get authored.
 * Admin-only, bounded by the request schema (each input is one judged container run).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    requireAdmin(await viewerFromRequest(request, now));
    const input = await readJson(request, GenerateOutputsRequestSchema);

    const outputs = await generateExpectedOutputs(input);
    return jsonOk(GenerateOutputsResponseSchema.parse({ outputs }), NO_STORE);
  });
}
