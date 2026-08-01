import type { NextResponse } from "next/server";
import { z } from "zod";

import {
  AddableUsersSchema,
  AdminAddParticipantRequestSchema,
  AdminRemoveParticipantRequestSchema,
  AdminRemoveParticipantResponseSchema,
  AdminRosterSchema,
} from "@/lib/schemas/api";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readJson,
  readParams,
} from "@/lib/contest/http";
import {
  ADDABLE_MAX_LIMIT,
  adminAddParticipant,
  adminAddableUsers,
  adminRemoveParticipant,
  adminRoster,
} from "@/lib/contest/teams";
import { actorLabel, requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";
import { ValidationError } from "@/lib/errors";

/**
 * `/api/admin/contests/{id}/participants` — who is IN this contest, and who could be.
 *
 * ## The bug this route exists to fix
 *
 * A `Participant` row belongs to exactly one contest and was created in exactly one place:
 * `ensureEnrolled`, at sign-in. `adminRoster` lists participants of the contest it is given, so a
 * contest created this morning contained nobody and could contain nobody — the organizer's report
 * was "I could not add any of the people who participated in the Demo to Test2 ... I could only
 * add people if they signed up or signed in AFTER the contest had started."
 *
 * That inverts the actual order of the evening. People are added, problems are assigned and teams
 * are formed, and THEN the contest starts. So membership gets its own route:
 *
 *  - `GET`    known accounts with no participant row here yet, searchable.
 *  - `POST`   put one on the roster, creating the participant.
 *  - `DELETE` take one off, saying what happens to their submissions first.
 *
 * `/roster` is deliberately still separate: it is the VIEW (teams, members, who is on none), and
 * every mutation here returns it so the screen cannot show a stale count of the thing it changed.
 *
 * ## Why DELETE carries a body
 *
 * It needs a reason and an explicit acknowledgement that judged submissions will be deleted with
 * the participant. `DELETE /api/admin/teams/{id}` already takes a reason the same way, and putting
 * an irreversible confirmation in a query string is how it ends up in a browser history and a
 * server log.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The search, parsed rather than read.
 *
 * A query string is a trust boundary like any other. `q` is capped because it goes into a
 * `contains` and there is no legitimate 4 KB name; `limit` is clamped in `adminAddableUsers` as
 * well, because a schema bound is a contract and the domain function must not depend on one
 * caller having applied it.
 */
const AddableUsersQuerySchema = z.object({
  q: z.string().max(120).default(""),
  limit: z.coerce.number().int().min(1).max(ADDABLE_MAX_LIMIT).default(20),
});

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    requireAdmin(await viewerFromRequest(request, now));

    const url = new URL(request.url);
    const parsed = AddableUsersQuerySchema.safeParse({
      q: url.searchParams.get("q") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid search");
    }

    const users = await adminAddableUsers(id, parsed.data.q, parsed.data.limit);

    return jsonOk(
      AddableUsersSchema.parse({
        users,
        // Equality, not "more than": the query took `limit` rows, so a full page is the only
        // evidence available that there were more. Saying so lets the screen ask for a narrower
        // search instead of silently showing the alphabetical first twenty as if they were all.
        truncated: users.length === parsed.data.limit,
      }),
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
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    const admin = requireAdmin(await viewerFromRequest(request, now));

    const input = await readJson(request, AdminAddParticipantRequestSchema);
    await adminAddParticipant(id, input.userId, actorLabel(admin));

    // The whole roster, like every other mutation on this screen. The new participant has no team,
    // so they appear in `unassigned` — which is the list an organizer works down.
    return jsonOk(AdminRosterSchema.parse(await adminRoster(id)), NO_STORE);
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    const admin = requireAdmin(await viewerFromRequest(request, now));

    const input = await readJson(request, AdminRemoveParticipantRequestSchema);
    // The contest comes from the path and the participant from the body, so the domain function
    // is given both and refuses the mismatch BEFORE it deletes anything.
    const removed = await adminRemoveParticipant(
      id,
      input.participantId,
      actorLabel(admin),
      input.reason,
      input.deleteSubmissions,
    );

    return jsonOk(
      AdminRemoveParticipantResponseSchema.parse({
        removed: {
          participantId: removed.participantId,
          displayName: removed.displayName,
          submissionsDeleted: removed.submissionCount,
        },
        roster: await adminRoster(id),
      }),
      NO_STORE,
    );
  });
}
