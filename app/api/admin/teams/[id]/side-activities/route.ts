import type { NextResponse } from "next/server";

import { z } from "zod";

import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/contest/audit";
import {
  NO_STORE,
  handle,
  jsonOk,
  readJson,
  readParams,
} from "@/lib/contest/http";
import { lockContestMutations } from "@/lib/contest/locks";
import { invalidateScoringInput } from "@/lib/contest/standings";
import {
  actorLabel,
  requireAdmin,
  viewerFromRequest,
} from "@/lib/contest/viewer";

/**
 * `GET  /api/admin/teams/{id}/side-activities` — what this team has been awarded.
 * `POST` — award points for a non-coding activity (metal puzzle, train tracks, Connections).
 *
 * **This is the only score input with no submission behind it**, which makes its audit trail the
 * only record that it happened at all. A judged submission can be replayed from the log; a puzzle
 * cannot. So `enteredBy` and `enteredAt` are not optional, and every write also lands in
 * `AuditLog`.
 *
 * Points may be negative, on purpose: an organizer correcting an over-award should not have to
 * delete history to do it. The correction and the original both stay visible.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TeamIdParamsSchema = z.object({ id: z.string().min(1) });

const SideActivitySchema = z.object({
  label: z.string().trim().min(1, "Name the activity").max(120),
  /**
   * Bounded in both directions. A typo of 8000 for 80 would silently decide the contest, and the
   * scoring engine has no way to know it was a typo — side activity points are added flat, so a
   * bad one is not diluted by team size the way a problem score would be.
   */
  points: z.number().int().min(-1000).max(1000),
});

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, TeamIdParamsSchema);
    requireAdmin(await viewerFromRequest(request, now));

    const team = await prisma.team.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        sideActivities: {
          select: {
            id: true,
            label: true,
            points: true,
            enteredBy: true,
            enteredAt: true,
          },
          orderBy: [{ enteredAt: "asc" }, { id: "asc" }],
        },
      },
    });

    if (team === null) throw new NotFoundError("Team");

    return jsonOk(
      {
        teamId: team.id,
        teamName: team.name,
        total: team.sideActivities.reduce((sum, a) => sum + a.points, 0),
        activities: team.sideActivities.map((a) => ({
          id: a.id,
          label: a.label,
          points: a.points,
          enteredBy: a.enteredBy,
          enteredAt: a.enteredAt.toISOString(),
        })),
      },
      NO_STORE,
    );
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, TeamIdParamsSchema);
    const admin = requireAdmin(await viewerFromRequest(request, now));
    const input = await readJson(request, SideActivitySchema);

    const owner = await prisma.team.findUnique({
      where: { id },
      select: { contestId: true },
    });
    if (owner === null) throw new NotFoundError("Team");

    // One transaction: an award without its audit row is exactly the state this feature exists to
    // prevent, since the audit row is the only evidence the award ever happened.
    const created = await prisma.$transaction(async (tx) => {
      await lockContestMutations(tx, owner.contestId);
      const enteredAt = new Date();
      const team = await tx.team.findUnique({
        where: { id },
        select: { id: true, name: true, contestId: true },
      });
      if (team === null) throw new NotFoundError("Team");

      const row = await tx.teamSideActivity.create({
        data: {
          teamId: team.id,
          label: input.label,
          points: input.points,
          enteredBy: actorLabel(admin),
          enteredAt,
        },
        select: { id: true, label: true, points: true, enteredAt: true },
      });

      await writeAudit(
        {
          actor: actorLabel(admin),
          action: AUDIT_ACTIONS.sideActivity,
          entity: `team:${team.id}`,
          after: {
            sideActivityId: row.id,
            label: row.label,
            points: row.points,
            team: team.name,
          },
        },
        tx,
      );

      return { row, contestId: team.contestId };
    });

    // The board is stale the instant this lands, and side activity points are part of the team
    // score — so the cached scoring input has to go.
    invalidateScoringInput(created.contestId);

    return jsonOk(
      {
        id: created.row.id,
        teamId: id,
        label: created.row.label,
        points: created.row.points,
        enteredAt: created.row.enteredAt.toISOString(),
      },
      NO_STORE,
    );
  });
}
