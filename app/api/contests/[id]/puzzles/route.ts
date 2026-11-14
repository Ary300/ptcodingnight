import type { NextResponse } from "next/server";

import { listPuzzles } from "@/lib/contest/puzzles";
import { ContestIdParamsSchema, NO_STORE, handle, jsonOk, readParams } from "@/lib/contest/http";
import { PuzzleListSchema } from "@/lib/schemas/api";
import { prisma } from "@/lib/db";
import { requireCompetitorOf, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/contests/{id}/puzzles` — my puzzle, the open ones, and which my team has solved.
 *
 * Signed-in competitors only, because "solved" is a fact about the caller's team and the list is
 * a fact about the caller's seat: a puzzle pinned to set B is not in a set-A student's list. The
 * answer key is never selected by the read behind this, so no serialiser change can start leaking
 * one.
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
      select: { teamId: true, chosenSet: { select: { label: true } } },
    });

    return jsonOk(
      PuzzleListSchema.parse({
        puzzles: await listPuzzles(
          participant?.teamId ?? null,
          participant?.chosenSet?.label ?? null,
        ),
      }),
      NO_STORE,
    );
  });
}
