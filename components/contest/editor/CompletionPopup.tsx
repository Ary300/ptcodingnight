"use client";

import { useLayoutEffect, useRef } from "react";

import type { CompletionItem, CompletionKind } from "./smart/types";

/**
 * The completion list under the caret, IntelliJ's "lookup".
 *
 * It never takes focus. The textarea keeps it the whole time and points at the active row with
 * `aria-activedescendant`, which is how a screen reader hears each suggestion while the student
 * keeps typing. A pointer press on a row is cancelled at `mousedown` for the same reason: letting
 * it through would blur the textarea, and blur closes the list before the click could land.
 *
 * It sits on `--ink` like the code it belongs to. Every colour here is one the overlay already
 * uses on that ground (DESIGN.md §2's measured table), so none of them is a new contrast claim.
 */

/** A letter per kind, as IntelliJ marks its rows: m for a method, f for a field, and so on. */
const KIND_BADGE: Readonly<Record<CompletionKind, { readonly letter: string; readonly name: string; readonly className: string }>> = {
  keyword: { letter: "k", name: "keyword", className: "text-gold" },
  type: { letter: "c", name: "type", className: "text-rise" },
  method: { letter: "m", name: "method", className: "text-fall" },
  function: { letter: "f", name: "function", className: "text-fall" },
  field: { letter: "f", name: "field", className: "text-rise" },
  variable: { letter: "v", name: "variable", className: "text-paper" },
  snippet: { letter: "t", name: "template", className: "text-gold" },
};

export interface CompletionPopupProps {
  readonly id: string;
  readonly items: readonly CompletionItem[];
  readonly activeIndex: number;
  /** Pixel position inside the editor's text box. `top` places it below the caret, `bottom` above. */
  readonly top: number | null;
  readonly bottom: number | null;
  readonly left: number;
  /** Pixels; the hook sizes the list to the room beside the caret's line. */
  readonly maxHeight: number;
  readonly optionId: (index: number) => string;
  readonly onPick: (index: number) => void;
  readonly onHover: (index: number) => void;
}

export function CompletionPopup({
  id,
  items,
  activeIndex,
  top,
  bottom,
  left,
  maxHeight,
  optionId,
  onPick,
  onHover,
}: CompletionPopupProps) {
  const listRef = useRef<HTMLUListElement | null>(null);

  // Keep the active row in view as the arrows walk past the visible eight, and pull the popup
  // back inside the editor when the caret is near the right edge. Both before paint, so the list
  // never draws once in the wrong place.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null) return;
    const active = list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (active !== null) {
      const above = active.offsetTop < list.scrollTop;
      const below = active.offsetTop + active.offsetHeight > list.scrollTop + list.clientHeight;
      if (above) list.scrollTop = active.offsetTop;
      else if (below) list.scrollTop = active.offsetTop + active.offsetHeight - list.clientHeight;
    }
    const parent = list.offsetParent;
    if (parent instanceof HTMLElement) {
      const overflow = left + list.offsetWidth - parent.clientWidth;
      list.style.left = `${Math.max(0, overflow > 0 ? left - overflow : left)}px`;
    }
  }, [activeIndex, items, left]);

  return (
    <ul
      ref={listRef}
      id={id}
      role="listbox"
      aria-label="Suggestions"
      className="absolute z-20 min-w-[14rem] max-w-[min(32rem,100%)] overflow-y-auto rounded-chip border border-rule-edge-inverse bg-ink py-1 font-mono text-paper shadow-lg"
      style={{
        top: top ?? undefined,
        bottom: bottom ?? undefined,
        left,
        fontSize: "var(--text-xs)",
        maxHeight,
      }}
    >
      {items.map((item, index) => {
        const badge = KIND_BADGE[item.kind];
        const active = index === activeIndex;
        return (
          <li
            key={`${item.kind}:${item.label}:${index}`}
            id={optionId(index)}
            data-index={index}
            role="option"
            aria-selected={active}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(index);
            }}
            onMouseMove={() => {
              if (!active) onHover(index);
            }}
            className={`flex h-7 cursor-pointer items-center gap-2 border-l-2 px-2 whitespace-nowrap ${
              active ? "border-gold bg-paper/10" : "border-transparent"
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-chip border border-rule-edge-inverse font-semibold ${badge.className}`}
            >
              {badge.letter}
            </span>
            {/* The spaces between the spans keep the option's accessible name as separate words
                ("method println(Object x) void"). A flex row lays none of them out. */}
            <span className="sr-only">{badge.name}</span>{" "}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.detail !== undefined && (
              <>
                {" "}
                <span className="shrink-0 pl-4 text-paper/65">{item.detail}</span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
