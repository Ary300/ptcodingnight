"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui";

/**
 * Copy sample I/O to the clipboard.
 *
 * The confirmation is a text swap plus a polite live region, not a colour change: a student
 * who cannot distinguish the two states still reads the word "Copied". `navigator.clipboard`
 * needs a secure context, and the contest runs over a LAN which may well be plain HTTP — so
 * failure is handled and reported rather than assumed away.
 */

const RESET_MS = 2_000;

export interface CopyButtonProps {
  value: string;
  /** What was copied, for the accessible name: "Copy sample 1 input". */
  what: string;
}

export function CopyButton({ value, what }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const id = setTimeout(() => setState("idle"), RESET_MS);
    return () => clearTimeout(id);
  }, [state]);

  const copy = useCallback(async () => {
    try {
      if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
        setState("failed");
        return;
      }
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      // Insecure context, or the user denied permission. Say so; do not pretend it worked.
      setState("failed");
    }
  }, [value]);

  const text = state === "copied" ? "Copied" : state === "failed" ? "Select it manually" : "Copy";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => void copy()}
        aria-label={`Copy ${what}`}
        className="px-2 py-1"
        style={{ fontSize: "var(--text-xs)" }}
      >
        {text}
      </Button>
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? `${what} copied.` : state === "failed" ? `Could not copy ${what}.` : ""}
      </span>
    </>
  );
}
