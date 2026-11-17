"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";

import type { Language } from "@/lib/schemas/judge";

import { orderLanguages } from "./language-order";
import { LANGUAGE_LABEL } from "./types";

/**
 * The editor's language tabs, one per language the problem allows.
 *
 * It was a "Language" label and a `ui/Select` until 2026-11-16, when the organizers asked for tabs:
 * the night is written in three languages, and a dropdown hides the two a student is not using
 * behind a click they have to know to make.
 *
 * ## The look, taken from `ui/TabStrip`
 *
 * Same type (`--text-sm`, semibold when active and medium at 70% ink when not), same bordered box
 * with no bottom border, same tinted tray. What changes is the panel underneath. The problem
 * page's tabs stand over paper, so the active tab is paper; these stand over the editor's dark
 * band, so the active tab is ink and runs straight into it. That is the folder-tab effect
 * TabStrip describes, kept: the selected tab and the code below it read as one surface.
 *
 * ## Order
 *
 * `orderLanguages`: Java 21, Python 3, C++17, then anything else the problem allows in registry
 * order. The ids come from `ProblemDetail.allowedLanguages` and the labels from the registry, and
 * neither is restated here.
 *
 * ## Keyboard
 *
 * A real `role="tablist"`. One tab is in the Tab order (the selected one); Left and Right move
 * between tabs and wrap, Home and End jump to the ends. Selection follows focus, which the APG
 * pattern recommends when showing the panel is instant, and here it is: each language keeps its
 * own draft, so stepping through the tabs loses nothing.
 *
 * ## Narrow screens
 *
 * The row scrolls sideways inside itself and never widens the page. Its scrollbar is hidden,
 * because a bar between the tabs and the editor would cut the selected tab off from its panel;
 * the selected tab is scrolled into view instead, so a remembered language at the far end of
 * the row is never off screen.
 */

export interface LanguagePickerProps {
  value: Language;
  allowed: readonly Language[];
  onChange: (next: Language) => void;
  disabled?: boolean;
}

const TAB_BASE =
  "inline-flex shrink-0 items-center whitespace-nowrap border px-3 pt-1.5 pb-2 sm:px-5 " +
  // Inset, so the ring is drawn inside the scroll box rather than clipped by it. `!` because the
  // global `:focus-visible` rule in globals.css is unlayered and outranks any utility otherwise.
  "focus-visible:outline-offset-[-4px]! disabled:cursor-not-allowed";

const TAB_ACTIVE = "border-rule-edge border-b-transparent bg-ink font-semibold text-paper";

const TAB_IDLE =
  "border-transparent font-medium text-ink/70 hover:text-ink disabled:text-ink/40 disabled:hover:text-ink/40";

export function LanguagePicker({ value, allowed, onChange, disabled = false }: LanguagePickerProps) {
  const languages = orderLanguages(allowed);
  const listRef = useRef<HTMLDivElement>(null);
  // A value the problem does not offer cannot be the roving stop, or no tab would be reachable.
  const focusable = languages.includes(value) ? value : languages[0];

  // Scroll the row, never the page: `scrollIntoView` would also move the window vertically.
  useLayoutEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (list === null || tab === null || tab === undefined) return;
    // The list is `relative`, so a tab's offsetLeft is measured from the list's own edge.
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
  }, [value]);

  function select(index: number) {
    const next = languages[index];
    if (next === undefined) return;
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
    if (next !== value) onChange(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = languages.length - 1;
    const target =
      event.key === "ArrowRight"
        ? index === last ? 0 : index + 1
        : event.key === "ArrowLeft"
          ? index === 0 ? last : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    select(target);
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Language"
      aria-orientation="horizontal"
      // `-mb-1` cancels the toolbar's bottom padding so the selected tab meets the editor band.
      className="relative -mb-1 flex max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {languages.map((language, index) => {
        const selected = language === value;
        return (
          <button
            key={language}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={language === focusable ? 0 : -1}
            disabled={disabled}
            onClick={() => select(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`${TAB_BASE} ${selected ? TAB_ACTIVE : TAB_IDLE}`}
            style={{ fontSize: "var(--text-sm)" }}
          >
            {LANGUAGE_LABEL[language]}
          </button>
        );
      })}
    </div>
  );
}
