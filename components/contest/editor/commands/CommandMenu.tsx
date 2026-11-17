"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A small numbered menu at the caret, for Surround With and Show Context Actions. It takes focus
 * (it is a menu the student is choosing from, unlike the completion list); Up and Down move, a
 * digit or Enter chooses, Escape closes, and focus goes back to the editor either way.
 */

export interface CommandMenuItem {
  readonly label: string;
}

export interface CommandMenuProps {
  readonly title: string;
  readonly items: readonly CommandMenuItem[];
  readonly top: number;
  readonly left: number;
  readonly onChoose: (index: number) => void;
  readonly onClose: () => void;
}

export function CommandMenu({ title, items, top, left, onChoose, onClose }: CommandMenuProps) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    refs.current[active]?.focus();
  }, [active]);

  return (
    <div
      role="menu"
      aria-label={title}
      className="absolute z-30 min-w-[12rem] rounded-chip border border-rule-edge bg-paper py-1 text-ink shadow-lg"
      style={{ top, left, fontSize: "var(--text-xs)" }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const delta = event.key === "ArrowDown" ? 1 : -1;
          setActive((current) => (current + delta + items.length) % items.length);
        } else if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          onClose();
        } else if (/^[1-9]$/.test(event.key)) {
          const index = Number(event.key) - 1;
          if (index < items.length) {
            event.preventDefault();
            onChoose(index);
          }
        }
      }}
    >
      <p className="px-3 pb-1 font-semibold text-ink/80">{title}</p>
      {items.map((item, index) => (
        <button
          key={item.label}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="button"
          role="menuitem"
          tabIndex={index === active ? 0 : -1}
          onMouseEnter={() => setActive(index)}
          onClick={() => onChoose(index)}
          className={`flex w-full items-baseline gap-2 px-3 py-1 text-left outline-none ${
            index === active ? "bg-ink text-paper" : "hover:bg-ink/10"
          }`}
        >
          <span className="numeric w-4 opacity-80">{index + 1}</span>
          <span className="font-mono">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
