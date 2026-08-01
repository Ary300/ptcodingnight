import type { ReactNode } from "react";

/**
 * A section of an admin screen.
 *
 * ## Why the rail is gone
 *
 * This used to render `<Rail state="brand">` on the leading edge of EVERY section of EVERY admin
 * page — six identical railed cards on `/admin`, four on `/admin/console`, two on the roster. A
 * mark that appears on everything marks nothing, and it spent the accent that each screen's one
 * primary action needed (DESIGN.md §2). `components/ui/Rail.tsx` now says so in its own docstring:
 * `brand` is division identity and problem-card status, not page furniture.
 *
 * ## Why there are two levels
 *
 * Because "is this a bounded object, or just a heading with things under it?" is a real question
 * and the old Panel answered "bounded object" for both. A stack of identical boxes has no lead,
 * which is most of why these screens read as emitted rather than laid out.
 *
 *  - **`bare`** — no box at all. A heading, an optional description, the content. Sections
 *    separate by whitespace and type size, which is what the three intervals in DESIGN.md §5c
 *    exist for. Correct for most of a page.
 *  - **`framed`** — `--rule-edge` outline at `--radius-panel`. For content that genuinely IS a
 *    bounded object: a table, a form, a thing you act on.
 *
 * `framed` is the default rather than `bare` only because it is the conservative rendering for a
 * call site that has not thought about it yet — a section that should have been bare reads as
 * over-boxed, whereas one that should have been framed reads as broken.
 *
 * The third level, "an organizer must not miss this", is `AlertPlate` below and is not a Panel.
 */

export type PanelLevel = "bare" | "framed";

export interface PanelProps {
  title: string;
  /** Sits next to the title: counts, states, small controls. */
  aside?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  level?: PanelLevel;
  className?: string;
}

export function Panel({
  title,
  aside,
  description,
  children,
  level = "framed",
  className,
}: PanelProps) {
  const box = level === "framed" ? "rounded-panel border border-rule-edge bg-paper p-5" : "";

  return (
    <section className={`min-w-0 ${box} ${className ?? ""}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}>{title}</h2>
        {aside}
      </header>
      {description !== undefined && (
        // `text-ink/70`, never a wrapper `opacity`: opacity multiplies with child alpha, and
        // tests/a11y/team-screens.spec.ts fails the whole surface for it.
        <p className="mt-tight max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          {description}
        </p>
      )}
      <div className="mt-group min-w-0">{children}</div>
    </section>
  );
}

/**
 * A dark plate. The only place `--gold`, `--rise` and `--fall` may appear, because all
 * three fail contrast on `--paper` (1.39 / 2.02 / 1.94) and clear AAA on `--ink`.
 *
 * ## What this is for, and what it is NOT for
 *
 * It is for a **standing condition an organizer must not be able to miss with a room watching**:
 * the board is frozen, the judge is not running, the console cannot be read at all. Inverting the
 * surface is a big gesture and it is spent on things at that weight.
 *
 * It is **not** for a rejected form. A field that was left blank is answered next to that field —
 * `components/admin/Field.tsx` wires the message to the control with `aria-describedby` so it is
 * both seen and announced, and it puts the answer where the fix is. A validation refusal rendered
 * as a black plate at the top of the page reads as "something has gone wrong with the judge", and
 * the organizer's eye leaves the field they were typing in to find out what.
 */
export interface AlertPlateProps {
  tone: "alarm" | "notice";
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  /**
   * Announce this plate when it appears. True for something that just happened — a failed
   * reference run. False for a standing condition that is simply part of the page, because a
   * live region present at first render is announced on arrival and turns a permanent status
   * into a permanent interruption.
   */
  live?: boolean;
}

export function AlertPlate({ tone, title, children, actions, live = true }: AlertPlateProps) {
  const accent = tone === "alarm" ? "var(--color-fall)" : "var(--color-gold)";

  return (
    <div
      role={live ? (tone === "alarm" ? "alert" : "status") : undefined}
      className="rounded-panel bg-ink p-5 text-paper"
      style={{ borderLeft: `var(--rail-width) solid ${accent}` }}
    >
      <h3 className="font-bold" style={{ color: accent, fontSize: "var(--text-md)" }}>
        {title}
      </h3>
      <div className="mt-tight max-w-[70ch]" style={{ fontSize: "var(--text-sm)" }}>
        {children}
      </div>
      {actions !== undefined && <div className="mt-group flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
