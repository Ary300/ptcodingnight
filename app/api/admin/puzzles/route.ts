import type { NextResponse } from "next/server";

import { adminPuzzleList, setPuzzleActive } from "@/lib/contest/puzzles";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import { AdminPuzzleListSchema, AdminSetPuzzleActiveRequestSchema } from "@/lib/schemas/api";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/admin/puzzles` lists every puzzle, hidden ones included.
 * `POST` shows or hides one.
 *
 * Hiding never deletes a solve or claws back an award: a team that earned points keeps them,
 * and the puzzle simply stops appearing.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    requireAdmin(await viewerFromRequest(request, new Date()));
    return jsonOk(AdminPuzzleListSchema.parse({ puzzles: await adminPuzzleList() }), NO_STORE);
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    requireAdmin(await viewerFromRequest(request, new Date()));
    const input = await readJson(request, AdminSetPuzzleActiveRequestSchema);
    await setPuzzleActive(input.slug, input.active);
    return jsonOk(AdminPuzzleListSchema.parse({ puzzles: await adminPuzzleList() }), NO_STORE);
  });
}
