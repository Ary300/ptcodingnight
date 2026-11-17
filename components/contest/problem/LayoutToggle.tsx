"use client";

import type { ReactNode } from "react";

import type { ProblemLayout } from "./split-layout";

/**
 * Stacked or side by side, at the right end of the Problem / My submissions strip.
 *
 * Two buttons with `aria-pressed` in a named group: each says what it gives you, the pressed one
 * is filled ink, and the state is the word as well as the colour (DESIGN.md §3). A switch would
 * hide which layout "off" means; two named options do not.
 *
 * The workspace renders this only when the window is wide enough for two panes, so a phone never
 * offers a layout it cannot show.
 */

export interface LayoutToggleProps {
  readonly value: ProblemLayout;
  readonly onChange: (next: ProblemLayout) => void;
}

function StackedIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="1.5" width="11" height="4.5" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.5" y="8" width="11" height="4.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function SideIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="1.5" width="4.5" height="11" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8" y="1.5" width="4.5" height="11" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

const OPTIONS: readonly { value: ProblemLayout; label: string; icon: ReactNode }[] = [
  { value: "stacked", label: "Stacked", icon: <StackedIcon /> },
  { value: "side", label: "Side by side", icon: <SideIcon /> },
];

export function LayoutToggle({ value, onChange }: LayoutToggleProps) {
  return (
    <div
      role="group"
      aria-label="Layout"
      className="inline-flex items-center gap-0.5 rounded-chip border border-rule-edge bg-paper p-0.5"
    >
      {OPTIONS.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 whitespace-nowrap transition-[color,background-color,transform] duration-[var(--motion-press)] active:scale-[0.97] ${
              pressed ? "bg-ink font-semibold text-paper" : "text-ink/70 hover:bg-ink/10 hover:text-ink"
            }`}
            style={{ fontSize: "var(--text-xs)" }}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
