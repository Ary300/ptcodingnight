"use client";

import { ProblemEditor } from "@/components/admin/ProblemEditor";
import type { AdminProblemSummary } from "@/components/admin/contract";
import {
  STUB_REFERENCE_SOLUTION,
  STUB_STATEMENT_MD,
  STUB_TEST_CASES,
  stubReferenceRun,
} from "@/components/admin/stub-data";

/**
 * Wires the authoring screen to its data source.
 *
 * A server component cannot hand a function to a client component, so the reference runner
 * is bound here rather than passed down from the page. When `app/api/admin/**` exists this
 * is the one place that changes: `stubReferenceRun` becomes a fetch.
 */
export function ProblemWorkbench({ problem }: { problem: AdminProblemSummary }) {
  return (
    <ProblemEditor
      problem={problem}
      initialStatement={problem.hasOriginalStatement ? STUB_STATEMENT_MD : ""}
      initialCases={problem.testCaseCount > 0 ? STUB_TEST_CASES : []}
      initialReferenceSolution={STUB_REFERENCE_SOLUTION}
      runReference={stubReferenceRun}
    />
  );
}
