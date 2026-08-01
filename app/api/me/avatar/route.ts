import type { NextResponse } from "next/server";

import { AVATAR_MAX_BYTES, clearAvatar, setAvatar } from "@/lib/contest/account";
import { NO_STORE, handle, jsonOk } from "@/lib/contest/http";
import { ValidationError } from "@/lib/errors";
import { requireAccountUserId, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `PUT /api/me/avatar` — upload a profile picture.
 * `DELETE /api/me/avatar` — remove it, falling back to the initial disc.
 *
 * The body is the raw image bytes with the type in `Content-Type`, not multipart or JSON: there is
 * exactly one file and a data-URL round trip through JSON would inflate it by a third for no gain.
 * The Settings page resizes the image to a small square before sending, so a normal upload is a
 * few KB; the size and type are still both validated server-side in `setAvatar`, because the
 * client is not trusted.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const viewer = await viewerFromRequest(request, now);
    const userId = requireAccountUserId(viewer);

    const mime = (request.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";

    // Refuse an oversized body before buffering it. content-length is client-supplied, so this is
    // the cheap first gate; setAvatar re-checks the real byte length, which cannot be lied to.
    const declared = Number.parseInt(request.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declared) && declared > AVATAR_MAX_BYTES) {
      throw new ValidationError(
        `That image is too large. Keep it under ${String(Math.floor(AVATAR_MAX_BYTES / 1024))} KB.`,
      );
    }

    const bytes = new Uint8Array(await request.arrayBuffer());
    await setAvatar(userId, bytes, mime, now);
    return jsonOk({ avatarUpdatedAt: now.toISOString() }, NO_STORE);
  });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const viewer = await viewerFromRequest(request, now);
    const userId = requireAccountUserId(viewer);
    await clearAvatar(userId, now);
    return jsonOk({ avatarUpdatedAt: null }, NO_STORE);
  });
}
