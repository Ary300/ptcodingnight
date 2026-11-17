"use client";

import { createContext, useContext, useLayoutEffect } from "react";

/**
 * Lets one competitor screen take the whole window under the top bar.
 *
 * Every competitor route sits in `CompetitorChrome`'s centred 1152px column with page padding,
 * and the page scrolls. The problem page's side-by-side layout is HackerRank's test editor
 * instead: two panes from the left edge of the window to the right, from the bottom of the top
 * bar to the bottom of the window, each scrolling by itself and the page never scrolling at all.
 * That box belongs to the chrome, so the page asks for it rather than fighting the column with
 * negative margins and measured heights.
 *
 * Asked for in a LAYOUT effect, so the chrome re-renders into the full-window frame before the
 * first paint of the split rather than one frame after it.
 */

type SetFullBleed = (on: boolean) => void;

export const FullBleedContext = createContext<SetFullBleed | null>(null);

/** While `on`, the chrome drops its column and page scroll; released on unmount. */
export function useFullBleed(on: boolean): void {
  const setFullBleed = useContext(FullBleedContext);
  useLayoutEffect(() => {
    if (setFullBleed === null || !on) return undefined;
    setFullBleed(true);
    return () => setFullBleed(false);
  }, [setFullBleed, on]);
}
