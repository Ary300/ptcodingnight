import { SetPlanner, type SetPlannerTeam } from "@/components/admin/SetPlanner";
import { prisma } from "@/lib/db";

/**
 * Splitting the bank into the sets a team's members hold.
 *
 * ## Why the roster is read here and not fetched by the component
 *
 * The one number this screen has to get right before an organizer touches anything is HOW MANY
 * SETS, and the answer is the size of the largest team: every member of a team holds a different
 * column, so a team of four needs four columns or somebody repeats one. That default has to be on
 * screen at first paint, not a spinner later, because it is the number most organizers will accept
 * without changing.
 *
 * ## Why sizes are counted rather than read off a field
 *
 * `_count` over the roster, every time. Team size is the divisor in every team score, and it is
 * also the input to this decision, so a stored size would be a second source of truth that drifts
 * from the roster it claims to describe. The same rule `contest-setup.ts` follows, for the same
 * reason.
 *
 * The set plan itself is not read here: `SetPlanner` gets it from
 * `GET /api/admin/contests/{id}/sets`, which is the same route it previews and applies through, so
 * what the screen shows and what the route would write cannot come from two different readings.
 */
export default async function ContestSetsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const rows = await prisma.team.findMany({
    where: { contestId: id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { members: true } } },
  });

  const teams: readonly SetPlannerTeam[] = rows.map((row) => ({
    teamId: row.id,
    name: row.name,
    size: row._count.members,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
          Sets
        </h2>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          A set is a column on the sheet: one bundle of questions, held by one member of every team.
          Everybody holding set A works the same questions, and no question is ever in two sets, so
          teammates cannot simply hand each other an answer.
        </p>
      </header>

      <SetPlanner contestId={id} teams={teams} />
    </div>
  );
}
