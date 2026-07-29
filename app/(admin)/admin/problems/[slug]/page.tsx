import Link from "next/link";
import { notFound } from "next/navigation";

import { ProblemWorkbench } from "@/components/admin/ProblemWorkbench";
import { STUB_PROBLEMS } from "@/components/admin/stub-data";

/**
 * Problem authoring. The problem is looked up from fixtures until the admin API exists.
 */
export default async function ProblemAuthoringPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const problem = STUB_PROBLEMS.find((p) => p.slug === slug);

  if (problem === undefined) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/problems" className="underline underline-offset-4" style={{ fontSize: "var(--text-sm)" }}>
        Back to the problem bank
      </Link>
      <ProblemWorkbench problem={problem} />
    </div>
  );
}
