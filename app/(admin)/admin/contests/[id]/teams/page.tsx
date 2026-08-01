import { RosterManager } from "@/components/admin/RosterManager";

/**
 * The roster, scoped by the path rather than by `?contest=`.
 *
 * There is still no implicit "current contest" — that was always the right rule, and it is now
 * enforced by the URL itself rather than by a picker on every screen. The id is visible, shareable
 * and preserved by every tab, which is what the query string was reaching for and never achieved.
 */
export default async function ContestTeamsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
          Teams
        </h2>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Team size is the divisor in every team score, so a roster change is a score change. Every
          action here is recorded with who did it and why.
        </p>
      </header>

      <RosterManager contestId={id} />
    </div>
  );
}
