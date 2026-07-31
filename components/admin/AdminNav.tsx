"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Admin navigation.
 *
 * The current page is marked with `aria-current`, not only with a colour — the same rule
 * the rest of this build follows, for the same reason.
 *
 * Tabs underlined in `--panther`, matching the competitor bar exactly. The filled red pill this
 * used to draw was the loudest thing on an organiser screen, competing with the two treatments
 * that are supposed to own that weight: a failing reference solution and an unhealthy judge.
 */

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/contest", label: "Contest" },
  { href: "/admin/problems", label: "Problems" },
  { href: "/admin/console", label: "Live console" },
  { href: "/admin/teams", label: "Teams" },
  // `/admin/side-activities` was built, routed, tested and in no nav — reachable only by typing
  // the URL. It is where side-activity points are entered, so a screen nobody can find is points
  // nobody awards, and the team score is short by exactly those points with nothing to show why.
  { href: "/admin/side-activities", label: "Side activities" },
  { href: "/admin/awards", label: "Awards" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
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
                  active
                    ? "inline-block border-b-2 border-panther pb-0.5 font-semibold text-paper"
                    : "inline-block border-b-2 border-transparent pb-0.5 text-paper/75 hover:text-paper"
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
