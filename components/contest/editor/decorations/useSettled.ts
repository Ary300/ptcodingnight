"use client";

import { useEffect, useState } from "react";

/**
 * `value`, once it has stayed the same for `delayMs`.
 *
 * The marks that would flicker under a typing student (an unclosed "{" is unclosed for the half
 * second between typing it and its partner) are drawn only when the settled value equals the
 * live one, that is, once the student has paused.
 */
export function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
