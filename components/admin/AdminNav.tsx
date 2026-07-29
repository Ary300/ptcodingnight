"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Admin navigation.
 *
 * The current page is marked with `aria-current`, not only with a colour — the same rule
 * the rest of this build follows, for the same reason.
 */

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/contest", label: "Contest" },
  { href: "/admin/problems", label: "Problems" },
  { href: "/admin/console", label: "Live console" },
  { href: "/admin/awards", label: "Awards" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections">
      <ul className="flex flex-wrap gap-1">
        {LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`inline-block rounded px-3 py-2 font-semibold ${
                  active ? "bg-panther text-paper" : "hover:bg-ink/5"
                }`}
                style={{ fontSize: "var(--text-sm)" }}
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
