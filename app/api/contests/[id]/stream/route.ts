import { ContestIdParamsSchema, handleRaw, readParams } from "@/lib/contest/http";
import { SSE_HEADERS, openContestStream } from "@/lib/contest/stream";
import { viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/contests/{id}/stream` — server-sent events for verdicts and standings.
 *
 * Everything sent here is also available from a plain GET; polling is the documented fallback
 * (docs/PRD.md §10). Verdict events are scoped to the participant who owns the submission, so a
 * spectator on this stream sees the board and the clock and nothing else.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<Response> {
  // A setup failure cannot be reported inside a stream, so it comes back as the ordinary JSON
  // envelope and the client falls back to polling.
  return handleRaw(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    const viewer = viewerFromRequest(request, now);

    return new Response(openContestStream(id, viewer, request.signal), { headers: SSE_HEADERS });
  });
}
