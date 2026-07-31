import type { NextResponse } from "next/server";

import { z } from "zod";

import { AdminRenameTeamRequestSchema, AdminReasonSchema, TeamViewSchema } from "@/lib/schemas/api";
import { NO_STORE, handle, jsonOk, readJson, readParams } from "@/lib/contest/http";
import { adminDissolveTeam, adminRenameTeam } from "@/lib/contest/teams";
import { actorLabel, requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `PATCH  /api/admin/teams/{id}` — rename.
 * `DELETE /api/admin/teams/{id}` — dissolve; members become teamless rather than deleted.
 *
 * Both require a reason. A rename looks cosmetic and is not: the team name is what appears on the
 * projector and in the exported results, so a rename after the fact changes what the record says
 * happened.
 *
 * Dissolving names its members in the audit row before the delete. `Participant.teamId` is
 * `onDelete: SetNull`, so the database would detach them anyway — but a cascade leaves no record
 * of *who* was on it, and that list is the only way to put the team back.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TeamIdParamsSchema = z.object({ id: z.string().min(1) });

export async function PATCH(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, TeamIdParamsSchema);
    const admin = requireAdmin(await viewerFromRequest(request, now));

    const input = await readJson(request, AdminRenameTeamRequestSchema);
    const team = await adminRenameTeam(id, actorLabel(admin), input.name, input.reason);

    return jsonOk(TeamViewSchema.parse(team), NO_STORE);
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, TeamIdParamsSchema);
    const admin = requireAdmin(await viewerFromRequest(request, now));

    const input = await readJson(request, AdminReasonSchema);
    await adminDissolveTeam(id, actorLabel(admin), input.reason);

    return jsonOk({ dissolved: true as const }, NO_STORE);
  });
}
