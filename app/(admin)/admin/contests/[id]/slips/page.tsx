import { adminRoster } from "@/lib/contest/teams";
import { contestNameFor } from "@/lib/contest/contests";
import { JoinCodeLookup } from "@/components/admin/JoinCodeLookup";

/**
 * `/admin/contests/{id}/slips` — the paper the night runs on.
 *
 * One card per student: their name, their team, their division, their set, and their code, big
 * enough to read while handing it over. Print this, cut it up, and every student has the one
 * thing they need at the door.
 *
 * ## Why this page exists instead of a team prefix inside the code
 *
 * The tempting design was a code like `PAN-4K7`, where the first characters name the team. It
 * answers a real question ("whose slip is this?") and creates a worse one: the team is a fact
 * that CHANGES, and a code is a string that cannot. Move one student between teams and their
 * printed code is either a lie or has to be reprinted, and the organizer's own scenario was
 * exactly that move.
 *
 * So the code stays opaque and the team is printed BESIDE it, in words, where a human reads it
 * and no software depends on it. Sorting the slips by team is the same job it always was, and
 * the code keeps working across every reshuffle.
 */
export default async function ContestSlipsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [roster, contestName] = await Promise.all([
    adminRoster(id),
    contestNameFor(id),
  ]);

  const seats = [
    ...roster.teams.flatMap((team) =>
      team.members.map((member) => ({ member, teamName: team.name })),
    ),
    ...roster.unassigned.map((member) => ({ member, teamName: null })),
  ];
  const withCodes = seats.filter((seat) => seat.member.joinCode !== null);
  const withoutCodes = seats.length - withCodes.length;

  return (
    <div className="flex flex-col gap-6">
      <header className="print:hidden">
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
          Join code slips
        </h2>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Print this page and cut along the lines. Each student needs one slip: the code signs
          them in and puts them on the team printed beside it. A student who changes teams keeps
          the same code, so only reprint a slip if you reissue that code.
        </p>
        {withoutCodes > 0 && (
          <p className="mt-2 font-semibold text-panther" style={{ fontSize: "var(--text-sm)" }}>
            {/* Explicit {" "} between every expression and the next word: JSX drops the
                whitespace around a line break, and this sentence rendered as "people haveno
                code yet". The same hazard the roster's own "no team score" line documents. */}
            {withoutCodes}{" "}
            {withoutCodes === 1 ? "person has" : "people have"}{" "}
            no code yet. Use &ldquo;Give everyone a join code&rdquo; on the Teams tab first.
          </p>
        )}
      </header>

      <div className="print:hidden">
        <JoinCodeLookup />
      </div>

      {withCodes.length === 0 ? (
        <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Nobody on this roster has a join code yet.
        </p>
      ) : (
        /*
          A print-first grid. `print:` utilities rather than a separate stylesheet, because the
          screen version and the paper version are the same content and drifting them apart is
          how the paper ends up missing the one field that matters.
        */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2 print:gap-0">
          {withCodes.map(({ member, teamName }) => (
            <section
              key={member.participantId}
              className="break-inside-avoid rounded-panel border border-rule-edge bg-paper p-4 print:rounded-none print:border-dashed"
            >
              <p className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
                {member.displayName}
              </p>
              <p className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
                {[
                  teamName === null ? "no team yet" : teamName,
                  member.divisionName,
                  member.chosenSetLabel === null ? null : `set ${member.chosenSetLabel}`,
                ]
                  .filter((part) => part !== null && part !== "")
                  .join(" · ")}
              </p>

              <p className="mt-3 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
                Go to ptcodingnight.com/join and type
              </p>
              {/* The code itself: monospaced and tracked out, because it is transcribed by hand
                  from this paper into a phone. */}
              <p
                className="numeric font-bold"
                style={{ fontSize: "var(--text-xl)", letterSpacing: "0.2em" }}
              >
                {member.joinCode}
              </p>

              <p className="mt-2 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
                {contestName ?? "Coding Night"}
              </p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
