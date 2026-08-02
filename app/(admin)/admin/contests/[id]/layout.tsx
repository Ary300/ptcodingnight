import { Crumbs } from "@/components/ui";
import { AlertPlate } from "@/components/admin/Panel";
import { ContestStatePill } from "@/components/admin/StatusPill";

import { contestSetup } from "./contest-setup";
import { ContestTabs } from "./tabs";

/**
 * One contest, and everything you do to it.
 *
 * ## The shape this copies, and the bug it removes
 *
 * HackerRank's contest admin is two levels: a flat list of contests, and — once you open one — a
 * tab strip that belongs to THAT contest. Identity is stated once, at the top, and every tab is a
 * facet of it. The organizer never re-identifies the contest they are working on.
 *
 * Ours was one level: seven global nav items, five of them contest-scoped by `?contest=<id>`, and
 * not one nav href carried the id. So the walk was: create a contest, click "Add problems", land
 * on a list of thirteen contests — two of them identically named, because the create form stayed
 * live after a successful create — and re-find by name the contest you made four seconds earlier.
 * Each of the five screens carried its own private copy of that picker.
 *
 * The id is a path segment now. That is the whole fix, and it is structural: a tab cannot forget
 * to append a query string it does not use, so this cannot regress one href at a time.
 *
 * ## A bad id does not blank the screen
 *
 * An organizer reaches a nonexistent contest by editing a URL or following a stale bookmark. The
 * layout says so, once, in a plate — and still renders the tabs and the child screen, each of
 * which already reports a missing contest in its own terms. `notFound()` here would replace the
 * only navigation back out with a 404 page.
 */

export default async function ContestLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const setup = await contestSetup(id);

  return (
    <div className="flex flex-col">
      {/* A rule under the crumb band: without it the trail and the identity block read as one
          run of text, and the reference separates them with a hairline and air on both sides. */}
      <div className="border-b border-rule-hair pb-3">
        <Crumbs
          trail={[
            { href: "/admin", label: "Contests" },
            { label: setup?.name ?? "Unknown contest" },
          ]}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Stepped down below `sm`: a flat 40px/60px h1 wraps a long contest name to three lines
            at 360 and pushes the tab strip past the first screenful. */}
        <h1 className="font-display font-bold text-[length:var(--text-lg)] sm:text-[length:var(--text-xl)]">
          {setup?.name ?? "Unknown contest"}
        </h1>
        {setup !== null && <ContestStatePill state={setup.state} />}
      </div>

      {setup === null ? (
        <div className="mt-4">
          <AlertPlate tone="alarm" title="There is no contest with that id">
            We could not find <code>{id}</code>. It may have been deleted. Go
            back to <strong>Contests</strong> and choose one.
          </AlertPlate>
        </div>
      ) : (
        <ContestTabs contestId={id} />
      )}

      <div className="pt-7">{children}</div>
    </div>
  );
}
