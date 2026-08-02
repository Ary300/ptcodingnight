import { LiveConsole } from "@/components/admin/LiveConsole";

/**
 * The screen an organizer works from during the round.
 *
 * Contest-scoped for a sharper reason than the other tabs: freezing the wrong contest's board
 * stops the wrong room's standings, and an override lands on the wrong student's score. Reading
 * the contest out of the path means the id the organizer is acting on is the one printed above the
 * tab strip, rather than one they picked on a previous screen and can no longer see.
 */
export default async function ContestConsolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
          Live console
        </h2>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          This view is never frozen, even while the public board is. Click a name to drill into
          one participant.
        </p>
      </header>

      <LiveConsole contestId={id} />
    </div>
  );
}
