"use client";

import { usePathname } from "next/navigation";

import { TabStrip, type TabStripItem } from "@/components/ui";

/**
 * The contest's own tab strip — HackerRank's second level, in our vocabulary.
 *
 * ## Why the id is in the PATH and not a query string
 *
 * Five organizer screens used to read their contest from `?contest=<id>`, and nothing in the nav
 * carried it: every href in `AdminNav` was bare, so any hop between two screens of the SAME
 * contest dropped the contest and landed on a 13-row picker. The fix is structural rather than a
 * list of hrefs to keep in sync — the id is a path segment, so a relative tab cannot lose it, and
 * a future tab cannot forget to append it.
 *
 * ## Six tabs that all do something
 *
 * HackerRank has ten (Details, Challenges, Advanced Settings, Moderators, Notifications, Signups,
 * Statistics…). Four of those have no meaning here and would be four empty screens, which is worse
 * than not having them. Side activities stays a first-class tab rather than being folded into a
 * settings page, because it is a SCORING INPUT with no submission behind it — the only points on
 * the night that no judge ever sees.
 *
 * Client-only because it needs `usePathname` to mark the current tab. `TabStrip` marks it with
 * `aria-current="page"` and a lifted edge, never with colour alone.
 *
 * ## Setup has its own segment, and that is not cosmetic
 *
 * `TabStrip` treats a tab as active when the pathname EQUALS its href or starts with `href + "/"`,
 * which is right for a nested tab and wrong for a bare parent: `/admin/contests/<id>` is a prefix
 * of all five siblings, so a Setup tab pointing there would render as the current page on every
 * tab at once — five wrong `aria-current="page"` markers, which is worse for a screen reader than
 * having none. `/setup` is a sibling like the rest, and the bare id redirects to it.
 */

export function ContestTabs({ contestId }: { readonly contestId: string }) {
  const pathname = usePathname();
  const base = `/admin/contests/${contestId}`;

  const items: readonly TabStripItem[] = [
    { href: `${base}/setup`, label: "Setup" },
    { href: `${base}/problems`, label: "Problems" },
    { href: `${base}/teams`, label: "Teams" },
    { href: `${base}/side-activities`, label: "Side activities" },
    { href: `${base}/console`, label: "Live console" },
    { href: `${base}/awards`, label: "Awards" },
  ];

  return <TabStrip items={items} pathname={pathname} label="Contest sections" />;
}
