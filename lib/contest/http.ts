import { NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok, type ApiError } from "@/lib/schemas/api";
import { DomainError, ValidationError, httpStatusFor, isDomainError } from "@/lib/errors";

/**
 * The route edge.
 *
 * Domain errors are thrown deep in `lib/contest/` and translated to HTTP exactly here — the
 * one place that knows about status codes (CLAUDE.md). Route handlers stay thin because the
 * translation is not their job.
 *
 * Nothing is swallowed. An error we did not model is logged with its detail and answered with
 * a generic message, because the detail is for us and the message is for a student.
 */

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(ok(data), init);
}

export function jsonFail(error: ApiError, status: number): NextResponse {
  return NextResponse.json(fail(error), { status });
}

function logUnexpected(error: unknown): void {
  console.error(
    JSON.stringify({
      level: "error",
      event: "api.unhandled",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    }),
  );
}

/**
 * Map anything thrown inside a handler to a response.
 *
 * A `DomainError` carries a code and a message that is already safe to show a student. A Zod
 * failure is a validation error by definition. Anything else is our bug: log it, and answer
 * with nothing that describes our internals.
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (isDomainError(error)) {
    return jsonFail({ code: error.code, message: error.publicMessage }, httpStatusFor(error));
  }

  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    return jsonFail({ code: "VALIDATION", message: first?.message ?? "Invalid request" }, 400);
  }

  logUnexpected(error);
  return jsonFail({ code: "INTERNAL", message: "Something went wrong on our end" }, 500);
}

/** Wrap a handler body so every route shares one error translation. */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error: unknown) {
    return toErrorResponse(error);
  }
}

/**
 * The same, for the two routes whose success case is not JSON: the CSV download and the SSE
 * stream. Their failures still come back as the ordinary envelope.
 */
export async function handleRaw(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error: unknown) {
    return toErrorResponse(error);
  }
}

/**
 * Parse a JSON body against a schema. Parse, never cast — this is the outer edge of the trust
 * boundary and the request came from a browser we do not control.
 */
/**
 * The largest request body any route accepts, in bytes.
 *
 * Sized off the biggest legitimate one — a submission's `sourceCode`, capped at 200 000
 * characters by `SubmitRequestSchema` — with room for the JSON envelope and multi-byte
 * characters. Anything an order of magnitude past that is not a student's program.
 */
const MAX_BODY_BYTES = 1024 * 1024;

export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  /**
   * Refuse an oversized body before buffering it.
   *
   * `request.json()` reads the whole body into memory first, and an App Router route handler has
   * no size limit of its own. `/api/join` and `/api/auth/password` are unauthenticated, so a
   * 500 MB POST from anyone on the internet is 500 MB inside a 768 MB container.
   *
   * The cap is generous against the largest legitimate body: a submission carries `sourceCode`,
   * which `SubmitRequestSchema` already caps at 200 000 characters.
   *
   * `content-length` is client-supplied and a chunked request omits it, so this is a cheap first
   * gate rather than the whole control — Caddy's `request_body max_size` is the one that cannot
   * be lied to. Both, because the app must not depend on a proxy being in front of it.
   */
  const declared = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ValidationError("Request body is too large");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Request body must be JSON");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ValidationError(first?.message ?? "Invalid request");
  }
  return parsed.data as z.infer<S>;
}

/** Route params arrive as a promise in the App Router; this keeps the unwrapping honest. */
export async function readParams<S extends z.ZodType>(
  params: Promise<unknown>,
  schema: S,
): Promise<z.infer<S>> {
  const parsed = schema.safeParse(await params);
  if (!parsed.success) throw new DomainError("NOT_FOUND", "Not found");
  return parsed.data as z.infer<S>;
}

export const ContestIdParamsSchema = z.object({ id: z.string().min(1) });
export const SubmissionIdParamsSchema = z.object({ id: z.string().min(1) });
export const ProblemParamsSchema = z.object({ id: z.string().min(1), slug: z.string().min(1) });

/** Responses that must never sit in a cache: every one of these is per-viewer or live. */
export const NO_STORE: ResponseInit = {
  headers: { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache" },
};
