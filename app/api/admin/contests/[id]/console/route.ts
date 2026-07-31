import type { NextResponse } from "next/server";

import { AdminConsoleViewSchema } from "@/lib/schemas/api";
import { adminConsole } from "@/lib/contest/console";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readParams,
} from "@/lib/contest/http";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/admin/contests/{id}/console` — the live console's whole screen, in one read.
 *
 * ## Admin truth, never the frozen board
 *
 * This is the one view that ignores the freeze. Freezing stops the PUBLIC standings updating
 * while judging continues (PRD §6.3), and the organizer's own console has to stay live or the
 * unfreeze at the end is a recalculation rather than a reveal. Nothing here consults `frozen`
 * except to report it, so the screen can say the board is frozen while showing what is really
 * happening behind it.
 *
 * ## Why it is not the SSE stream
 *
 * `/api/contests/{id}/stream` exists and pushes standings and verdicts. It is scoped to what a
 * COMPETITOR may see: it respects the freeze and never carries another student's submission. An
 * organizer needs the opposite of both. Reusing it would mean adding an "admin mode" to the one
 * transport students hold open, and a bug in that flag leaks the frozen board to the room.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    requireAdmin(await viewerFromRequest(request, new Date()));

    return jsonOk(AdminConsoleViewSchema.parse(await adminConsole(id)), NO_STORE);
  });
}
