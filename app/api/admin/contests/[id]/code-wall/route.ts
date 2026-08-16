import type { NextResponse } from "next/server";

import { codeWallSeats } from "@/lib/contest/join-code";
import { contestNameFor } from "@/lib/contest/contests";
import { ContestIdParamsSchema, NO_STORE, handle, jsonOk, readParams } from "@/lib/contest/http";
import { NotFoundError } from "@/lib/errors";
import { CodeWallSchema } from "@/lib/schemas/api";
import { prisma } from "@/lib/db";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/admin/contests/{id}/code-wall` — every seat's join code, A to Z, with who is already in.
 *
 * ORGANIZER ONLY, and it is the most sensitive read in the admin surface: a join code signs its
 * holder in as that student. It is behind `requireAdmin` for that reason, and `NO_STORE` so no
 * proxy or browser keeps a copy of a roster's worth of credentials.
 *
 * The screen that consumes this projects it, which is a deliberate exposure the organizer chooses
 * (see `lib/contest/code-wall.ts`). Nothing about that changes what this route is allowed to send,
 * only who is standing in front of the projector.
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
    requireAdmin(await viewerFromRequest(request, now));

    const [contestName, seats, seatsWithoutCode] = await Promise.all([
      contestNameFor(id),
      codeWallSeats(id, now),
      prisma.participant.count({ where: { contestId: id, joinCode: null } }),
    ]);
    // A wall for a contest that does not exist is a 404, not an unnamed wall of nobody.
    if (contestName === null) throw new NotFoundError("Contest");

    return jsonOk(CodeWallSchema.parse({ contestName, seats, seatsWithoutCode }), NO_STORE);
  });
}
