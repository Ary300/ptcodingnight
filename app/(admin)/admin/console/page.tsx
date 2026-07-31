import { ContestPicker } from "@/components/admin/ContestPicker";
import { LiveConsole } from "@/components/admin/LiveConsole";

/**
 * `/admin/console?contest=<id>` — the screen an organizer works from during the round.
 *
 * Contest-pinned like the roster and the side activities, and for a sharper reason than either:
 * freezing the wrong contest's board stops the wrong room's standings, and an override lands on
 * the wrong student's score. There is no implicit "current contest" to guess at.
 *
 * This page used to hand `LiveConsole` two fixtures. It now hands it a contest id and the console
 * reads the server.
 */
export default async function LiveConsolePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const contest = params.contest;
  const contestId = typeof contest === "string" && contest.length > 0 ? contest : null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          Live console
        </h1>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Admin truth: this view is never frozen, even while the public board is. Click a name to
          drill into one participant.
        </p>
      </header>

      {contestId === null ? (
        <ContestPicker basePath="/admin/console" purpose="the live console" />
      ) : (
        <LiveConsole contestId={contestId} />
      )}
    </div>
  );
}
