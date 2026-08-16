import type { NextResponse } from "next/server";
import { z } from "zod";

import { attemptPuzzle } from "@/lib/contest/puzzles";
import { NO_STORE, handle, jsonOk, readJson, readParams } from "@/lib/contest/http";
import { PuzzleAttemptRequestSchema, PuzzleAttemptResponseSchema } from "@/lib/schemas/api";
import { prisma } from "@/lib/db";
import { requireCompetitorOf, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/contests/{id}/puzzles/{slug}` — submit an answer.
 *
 * Checking happens server-side and the key never leaves it. A correct answer pays the caller's
 * team once, as a side activity award, which is the same currency the metal puzzle pays in.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1), slug: z.string().min(1) });

export async function POST(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id, slug } = await readParams(context.params, ParamsSchema);
    const viewer = requireCompetitorOf(await viewerFromRequest(request, now), id);
    const input = await readJson(request, PuzzleAttemptRequestSchema);

    const participant = await prisma.participant.findUnique({
      where: { id: viewer.participantId },
      select: { teamId: true },
    });

    return jsonOk(
      PuzzleAttemptResponseSchema.parse(
        await attemptPuzzle({
          slug,
          answer: input.answer,
          participantId: viewer.participantId,
          teamId: participant?.teamId ?? null,
          contestId: id,
        }),
      ),
      NO_STORE,
    );
  });
}
