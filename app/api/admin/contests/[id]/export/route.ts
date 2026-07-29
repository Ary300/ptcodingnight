import { exportStandings } from "@/lib/contest/admin";
import { ContestIdParamsSchema, handleRaw, readParams } from "@/lib/contest/http";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/admin/contests/{id}/export` — final standings as CSV.
 *
 * The spreadsheet is an **output**, never an input (docs/PRD.md §9.2). Nothing in the platform
 * reads this format back, and no route accepts it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<Response> {
  return handleRaw(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    const admin = requireAdmin(viewerFromRequest(request, now));

    const { csv, filename } = await exportStandings(id, admin, now);

    // Outside the JSON envelope on purpose: this is a file a browser downloads.
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
