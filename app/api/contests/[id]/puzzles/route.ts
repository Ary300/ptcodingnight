import type { NextResponse } from "next/server";

import { listPuzzles } from "@/lib/contest/puzzles";
import { ContestIdParamsSchema, NO_STORE, handle, jsonOk, readParams } from "@/lib/contest/http";
import { PuzzleListSchema } from "@/lib/schemas/api";
import { prisma } from "@/lib/db";
import { requireCompetitorOf, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/contests/{id}/puzzles` — the browser puzzles, and which ones my team has solved.
 *
 * Signed-in competitors only, because "solved" is a fact about the caller's team. The answer key
 * is never selected by the read behind this, so no serialiser change can start leaking one.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    const viewer = requireCompetitorOf(await viewerFromRequest(request, now), id);

    const participant = await prisma.participant.findUnique({
      where: { id: viewer.participantId },
      select: { teamId: true },
    });

    return jsonOk(
      PuzzleListSchema.parse({ puzzles: await listPuzzles(participant?.teamId ?? null) }),
      NO_STORE,
    );
  });
}
