"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The organizer's TOP-LEVEL navigation — two items, because there are two things that are not
 * inside a contest.
 *
 * ## Why it used to be seven, and why that was the bug
 *
 * It listed Overview, Contest, Problems, Live console, Teams, Side activities and Awards. Five of
 * those seven were contest-scoped by `?contest=<id>` — and **not one of these hrefs carried it**.
 * So standing on `/admin/problems?contest=cms9lx…` and clicking "Teams" went to bare
 * `/admin/teams`, which had no contest, which rendered a thirteen-row picker asking which contest
 * the organizer had been inside two seconds earlier. Five screens each carried a private copy of
 * that picker to compensate.
 *
 * A query string is not inherited by a link; a path segment is. The five moved under
 * `/admin/contests/<id>/…` and became tabs of the contest (`ContestTabs`), so this bar is left
 * with the two destinations that genuinely have no contest:
 *
 * - **Contests** — the list, and the only place a contest is created.
 * - **Problem bank** — the 130 problems, their DRAFT gate and their past-contest history. It is
 *   the same bank whichever contest you are building, so it does not belong to one.
 *
 * Nothing was removed. Teams, side activities, the console and awards are one click further in and
 * carry their contest with them; their old flat URLs still resolve.
 *
 * The current page is marked with `aria-current`, not only with a colour — the same rule the rest
 * of this build follows, for the same reason. Underlined in `--panther`, matching the competitor
 * bar exactly.
 */

const LINKS = [
  { href: "/admin", label: "Contests" },
  { href: "/admin/problems", label: "Problem bank" },
] as const;

/**
 * `/admin` is exact-match only: it is a prefix of every other admin URL, so a `startsWith` test
 * would mark Contests as the current page on every screen in the console.
 *
 * "Contests" does stay marked while you are inside one (`/admin/contests/…`), which is true — the
 * contest's own tab strip says which facet, and this bar says which half of the product.
 */
function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" || pathname.startsWith("/admin/contest") : pathname.startsWith(href);
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections">
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={
                  // py-1.5, like the marketing header's links: at 360 the bare text box measured
                  // 23px tall, under the 24px target floor (WCAG 2.5.8), and a thumb on a phone
                  // is how this bar gets used on the night.
                  active
                    ? "inline-block border-b-2 border-panther py-1.5 font-semibold text-paper"
                    : "inline-block border-b-2 border-transparent py-1.5 text-paper/75 hover:text-paper"
                }
                style={{ fontSize: "var(--text-xs)" }}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
