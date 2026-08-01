import type { NextResponse } from "next/server";

import { z } from "zod";

import { CreateProblemRequestSchema, CreateProblemResponseSchema } from "@/lib/schemas/api";
import { NO_STORE, handle, jsonOk, readJson, readParams } from "@/lib/contest/http";
import { deleteAuthoredProblem, updateAuthoredProblem } from "@/lib/contest/problem-author";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `PATCH  /api/admin/problems/{slug}` — save an edit to a coding question.
 * `DELETE /api/admin/problems/{slug}` — remove one, rows and test files together.
 *
 * Organizer-only, like everything under `/api/admin`. Both refusals that matter live in
 * `lib/contest/problem-author.ts` rather than here, because both have to hold for every caller:
 * the organizer screen posts to these routes, and so would anything else. A rule enforced at one
 * of two doors is a rule with a door left open.
 *
 * ## Why this is a PATCH and not a PUT
 *
 * The body is the whole question, which reads like a PUT, except for one field: `signature` absent
 * means "leave the starter code exactly as it is", and `signature: null` means "this question no
 * longer has starter code". A PUT promises the body is the complete new state, and under that
 * promise the builder would have to send a signature it may not be able to represent, flattening a
 * hand-authored harness on every save. See `toAuthoredSignature`.
 *
 * ## Why DELETE takes a body
 *
 * `confirmTitle` must equal the question's title. A DELETE that a mis-aimed request can complete
 * is one keystroke away from taking test data off disk, and this route is reachable by anything
 * holding an organizer cookie. The typed name is checked in `deleteAuthoredProblem`, so the screen
 * and the API cannot disagree about what counts as confirmation.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProblemSlugParamsSchema = z.object({ slug: z.string().min(1) });

/**
 * The same body the create route takes. Deliberately the same schema object rather than a copy:
 * the two paths accept the same question or the edit screen becomes a way to store something the
 * create screen would have refused.
 */
const UpdateProblemRequestSchema = CreateProblemRequestSchema;

const DeleteProblemRequestSchema = z.object({
  confirmTitle: z.string().min(1, "Type the question's name to confirm."),
});

const DeleteProblemResponseSchema = z.object({
  slug: z.string(),
  title: z.string(),
  removedFromContests: z.number().int(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const { slug } = await readParams(context.params, ProblemSlugParamsSchema);
    requireAdmin(await viewerFromRequest(request, new Date()));

    const input = await readJson(request, UpdateProblemRequestSchema);
    const updated = await updateAuthoredProblem(slug, input);

    return jsonOk(CreateProblemResponseSchema.parse(updated), NO_STORE);
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const { slug } = await readParams(context.params, ProblemSlugParamsSchema);
    requireAdmin(await viewerFromRequest(request, new Date()));

    const input = await readJson(request, DeleteProblemRequestSchema);
    const deleted = await deleteAuthoredProblem(slug, { confirmTitle: input.confirmTitle });

    return jsonOk(DeleteProblemResponseSchema.parse(deleted), NO_STORE);
  });
}
