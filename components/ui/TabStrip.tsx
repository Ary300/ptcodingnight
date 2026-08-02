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
 * ## The numbers, measured
 *
 * Pixel-scanned off both strips at 2x, and they agree to the pixel, which is why they are
 * trusted here: the challenge strip (`Hackerrank Challenge Statement Format/1.36.42`) and the
 * contest admin strip (`12.24.11`, `12.24.47`, `12.24.55`, `12.25.00`).
 *
 * | | HackerRank | Ours, before |
 * |---|---|---|
 * | strip border | 1px `#C3C7CF` on ALL FOUR sides | bottom only |
 * | strip height | 62px | 47px |
 * | active tab | 51px, inset ~11px from the strip's top, flush at the bottom | 46px, filling the strip top to bottom |
 * | tab side padding | 20-22px | 16px |
 * | tab row inset from the strip's left | 10-12px | 8px |
 * | label baseline | centred in the strip's full 60px interior | centred |
 *
 * The inset at the top is the part that was missing and the part that does the work. With the
 * active tab filling the strip edge to edge there is no tint above it, so it reads as a selected
 * cell in a segmented control; with 10px of tint over it, it reads as a folder tab standing in a
 * tray. Note that the label does NOT move with the box: it stays centred in the whole strip, so
 * the active tab has more room below its label than above it, which is what tips it downward
 * into the panel.
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
    <nav aria-label={label} className="mt-4 border border-rule-edge bg-ink/[0.04]">
      {/*
        `overflow-x-auto` on the strip and nowhere else. Seven tabs at 360px do not fit, and the
        alternatives are worse: wrapping turns the strip into two rows that no longer read as
        tabs, and shrinking the labels makes them unreadable on the phone half the room is using.

        `-mb-px` lives HERE and not on the active tab, and that is load-bearing now that the strip
        has a border on all four sides. The active tab's paper has to cover the strip's bottom
        border, and it can only do that if it reaches the strip's bottom edge — which it does not
        once the row is pushed down by `pt-2.5`. Pulling the whole row down by a pixel instead
        works whichever tab is active, and it cannot be defeated by an inactive tab being the
        tallest thing in the row. A parent's border paints before its descendants' backgrounds, so
        the tab covers the border rather than the other way round.
      */}
      <ul className="-mb-px flex overflow-x-auto px-2.5 pt-2.5">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  // `pt-2 pb-4`, not a symmetric `py`: the strip's 10px of top padding is what
                  // lifts the tab out of the tray, and the label has to stay centred in the STRIP
                  // rather than in the tab, so the tab keeps 8px above its label and 16px below.
                  // Both branches carry the same box so the row does not resize on navigation.
                  active
                    ? "inline-block border border-rule-edge border-b-transparent bg-paper px-5 pt-2 pb-4 font-semibold"
                    : "inline-block border border-transparent px-5 pt-2 pb-4 font-medium text-ink/70 hover:text-ink"
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
