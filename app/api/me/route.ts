import type { NextResponse } from "next/server";

import { getAccountProfile, renameAccount } from "@/lib/contest/account";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import { RenameAccountRequestSchema } from "@/lib/schemas/api";
import { requireAccountUserId, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/me` — the signed-in student's own profile.
 * `PATCH /api/me` — change the display name.
 *
 * Both are strictly first-person: the account is resolved from the session cookie, never from a
 * parameter, so there is no id a caller could swap to read or edit somebody else. A join-by-code
 * competitor has no account and is refused by `requireAccountUserId` with a message.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const viewer = await viewerFromRequest(request, new Date());
    const userId = requireAccountUserId(viewer);
    return jsonOk(await getAccountProfile(userId), NO_STORE);
  });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const viewer = await viewerFromRequest(request, now);
    const userId = requireAccountUserId(viewer);
    const { displayName } = await readJson(request, RenameAccountRequestSchema);
    return jsonOk(await renameAccount(userId, displayName, now), NO_STORE);
  });
}
