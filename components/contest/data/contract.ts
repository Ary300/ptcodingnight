import { z } from "zod";

import {
  HintBalanceSchema,
  JoinResponseSchema,
  PublicTestResultSchema,
  RunSamplesResponseSchema,
  SubmissionViewSchema,
  VerdictEventSchema,
} from "@/lib/schemas/api";

/**
 * Type aliases for the parts of the frozen wire contract that `lib/schemas/api.ts` defines
 * as schemas but does not export a TypeScript type for.
 *
 * These are `z.infer` over the orchestrator's schemas — never hand-written shapes. If the
 * contract moves, these move with it and the compiler finds every call site. Nothing here
 * invents a field; see the report for the places the contract did not cover what the UI
 * needed.
 */

export type JoinResponse = z.infer<typeof JoinResponseSchema>;
export type HintBalance = z.infer<typeof HintBalanceSchema>;
export type RunSamplesResponse = z.infer<typeof RunSamplesResponseSchema>;
export type VerdictEvent = z.infer<typeof VerdictEventSchema>;

/**
 * `GET /api/submissions` — the "my submissions" history (PRD §9.1). The contract defines
 * `SubmissionViewSchema` but no list envelope, so the list is modelled as a plain array of
 * the frozen row type rather than a new shape.
 */
export const SubmissionListSchema = z.array(SubmissionViewSchema);

export const PublicTestResultListSchema = z.array(PublicTestResultSchema);

/**
 * The response envelope from `lib/schemas/api.ts`. `ok()` and `fail()` are helpers there
 * rather than schemas, so the shape is spelled out once here.
 *
 * The payload is left as `unknown` and parsed in a second step with the caller's schema.
 * Folding it into a discriminated union of the two envelope halves reads better but does
 * not survive a generic parameter — the inferred output collapses and `data` stops
 * narrowing.
 */
export const ApiEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});
