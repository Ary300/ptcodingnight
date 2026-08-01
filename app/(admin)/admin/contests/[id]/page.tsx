import { redirect } from "next/navigation";

/**
 * `/admin/contests/{id}` is the contest's canonical URL — it is what create pushes to, and what a
 * breadcrumb or a bookmark names. It resolves to the first tab.
 *
 * A redirect rather than rendering Setup here, because `TabStrip` marks a tab active when the
 * pathname equals its href or starts with `href + "/"`: a Setup tab pointing at the bare id would
 * be a prefix of all five siblings and would render `aria-current="page"` on every tab at once.
 * One canonical path per tab is the cheaper way to be right about that.
 */
export default async function ContestRootPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/contests/${encodeURIComponent(id)}/setup`);
}
