import { getAvatar } from "@/lib/contest/account";
import { ContestIdParamsSchema, handleRaw, readParams } from "@/lib/contest/http";

/**
 * `GET /api/users/{id}/avatar` — the raw profile picture, for an `<img src>`.
 *
 * ## Why this is not behind a session check
 *
 * A profile picture is content the student chose to show next to their name; the same name and
 * face appear on the leaderboard the whole room watches. Gating the image but not the name would
 * be security theatre. What IS protected is the write side: only the account owner can set or
 * clear their own avatar (`/api/me/avatar`). This route only reads what they chose to publish.
 *
 * ## Caching
 *
 * The bytes are immutable for a given `?v=` (the avatar's `updatedAt`), so a long immutable cache
 * is safe and keeps a board of forty faces from refetching on every standings tick. A request with
 * no `v` is cached only briefly, because without the version there is nothing to invalidate on.
 *
 * A user with no avatar is a 404, which the client's `<img onError>` turns into the initial disc.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<Response> {
  return handleRaw(async () => {
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    const avatar = await getAvatar(id);
    if (avatar === null) {
      return new Response("No avatar", { status: 404 });
    }

    const versioned = new URL(request.url).searchParams.get("v") !== null;
    const cacheControl = versioned
      ? "public, max-age=31536000, immutable"
      : "public, max-age=60";

    // Uint8Array is a valid BodyInit; copy into a fresh one so the Buffer's backing ArrayBuffer
    // is not shared with anything else the runtime might reuse.
    const body = new Uint8Array(avatar.data);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": avatar.mime,
        "Content-Length": String(body.byteLength),
        "Cache-Control": cacheControl,
      },
    });
  });
}
