"use client";

import Link from "next/link";

/**
 * The folder-tab strip HackerRank puts under a page title.
 *
 * ## What it is copying, precisely
 *
 * A tinted bar with a hairline border, and the active tab lifted out of it: paper ground, its own
 * border, and **no bottom border**, so the tab and the panel below read as one surface. That last
 * detail is the whole effect. Draw the active tab as a filled pill instead and you get a button
 * group — something you press — rather than a tab, which is somewhere you already are.
 *
 * HackerRank uses this shape in both halves of its product, on a challenge (Problem | Submissions)
 * and on a contest's admin (Details | Challenges | Advanced Settings | …). It is one component
 * here for the same reason: a student and an organizer should recognise the same furniture.
 *
 * ## Links, not buttons
 *
 * Each tab is a URL. A tab strip built out of `useState` loses the reader's place on reload, on
 * back, and on a shared link — and "send me the link to that problem's submissions" is a thing
 * people do on a contest night.
 *
 * ## Accessibility
 *
 * Deliberately NOT `role="tablist"`. That role promises the arrow-key interaction pattern of a
 * tab widget whose panels live in the same document; these navigate. A nav landmark with
 * `aria-current="page"` describes what this actually is, and it is what the rest of this build
 * uses for the same reason (DESIGN.md §3: never colour alone).
 */

export interface TabStripItem {
  readonly href: string;
  readonly label: string;
  /** Rendered after the label, quieter — HackerRank's "Submissions: 10" counts. */
  readonly badge?: string;
}

export interface TabStripProps {
  readonly items: readonly TabStripItem[];
  /** The current pathname. A tab is active when it matches, or is a prefix of, this. */
  readonly pathname: string;
  /** Names the strip for assistive technology, e.g. "Problem sections". */
  readonly label: string;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TabStrip({ items, pathname, label }: TabStripProps) {
  return (
    <nav aria-label={label} className="mt-4 border-b border-rule-edge bg-ink/[0.04]">
      {/*
        `overflow-x-auto` on the strip and nowhere else. Seven tabs at 360px do not fit, and the
        alternatives are worse: wrapping turns the strip into two rows that no longer read as
        tabs, and shrinking the labels makes them unreadable on the phone half the room is using.
      */}
      <ul className="flex overflow-x-auto px-2">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? // -mb-px pulls the tab down over the strip's own bottom border, which is
                      // what makes it look joined to the panel rather than sitting above it.
                      "-mb-px inline-block border border-rule-edge border-b-transparent bg-paper px-4 py-2.5 font-semibold"
                    : "inline-block border border-transparent px-4 py-2.5 font-medium text-ink/70 hover:text-ink"
                }
                style={{ fontSize: "var(--text-sm)" }}
              >
                {item.label}
                {item.badge !== undefined && (
                  <span className="numeric ml-2 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
                    {item.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The breadcrumb above the title: `All contests › Coding Night › A Very Big Sum`.
 *
 * The last crumb is the page you are on, so it is text rather than a link — a link to here is a
 * link that does nothing, and on a touch screen it is a link that does nothing and looks tappable.
 */
export interface CrumbsProps {
  readonly trail: readonly { readonly href?: string; readonly label: string }[];
}

export function Crumbs({ trail }: CrumbsProps) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
        {trail.map((crumb, index) => (
          <li key={`${crumb.label}-${String(index)}`} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden="true" className="text-ink/40">
                ›
              </span>
            )}
            {crumb.href === undefined ? (
              <span className="text-ink" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <Link href={crumb.href} className="hover:text-panther hover:underline underline-offset-2">
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
