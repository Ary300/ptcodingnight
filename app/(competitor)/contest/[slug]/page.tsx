import { ProblemWorkspace } from "@/components/contest/problem/ProblemWorkspace";

/**
 * `params` is a Promise in this Next version, so the slug is awaited here and the workspace
 * below it stays a plain client component with a string prop.
 */
export default async function ProblemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProblemWorkspace slug={slug} />;
}
