import type { ReactNode } from "react";

import { Rail } from "@/components/ui";

/**
 * The admin surface is the quiet one (DESIGN.md §5): `--paper` ground, `--ink` text, one
 * accent. A panel is a card with the shared rail on its leading edge — the same device the
 * projector uses — so admin and projector read as one system rather than two products.
 */

export interface PanelProps {
  title: string;
  /** Sits next to the title: counts, states, small controls. */
  aside?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, aside, description, children, className }: PanelProps) {
  return (
    <section className={`flex rounded border border-ink/12 bg-paper ${className ?? ""}`}>
      {/* `brand` is chrome only — it never encodes a rank state (Rail.tsx). */}
      <Rail state="brand" className="rounded-l" />
      <div className="min-w-0 flex-1 p-5">
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}>{title}</h2>
          {aside}
        </header>
        {description !== undefined && (
          <p className="mb-4 max-w-[70ch] opacity-75" style={{ fontSize: "var(--text-sm)" }}>
            {description}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}

/**
 * A dark plate. The only place `--gold`, `--rise` and `--fall` may appear, because all
 * three fail contrast on `--paper` (1.39 / 2.02 / 1.94) and clear AAA on `--ink`.
 * Used for the reference-runner failure and the freeze banner — the two things an organiser
 * must not be able to miss with a room watching.
 */
export interface AlertPlateProps {
  tone: "alarm" | "notice";
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  /**
   * Announce this plate when it appears. True for something that just happened — a failed
   * reference run, a rejected form. False for a standing condition that is simply part of
   * the page, because a live region present at first render is announced on arrival and
   * turns a permanent status into a permanent interruption.
   */
  live?: boolean;
}

export function AlertPlate({ tone, title, children, actions, live = true }: AlertPlateProps) {
  const accent = tone === "alarm" ? "var(--color-fall)" : "var(--color-gold)";

  return (
    <div
      role={live ? (tone === "alarm" ? "alert" : "status") : undefined}
      className="rounded bg-ink p-4 text-paper"
      style={{ borderLeft: `var(--rail-width) solid ${accent}` }}
    >
      <h3 className="font-bold" style={{ color: accent, fontSize: "var(--text-md)" }}>
        {title}
      </h3>
      <div className="mt-2 max-w-[70ch]" style={{ fontSize: "var(--text-sm)" }}>
        {children}
      </div>
      {actions !== undefined && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
