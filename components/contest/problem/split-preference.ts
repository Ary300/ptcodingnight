import {
  parseLayout,
  parseSplit,
  SIDE_BY_SIDE_MIN_WIDTH_PX,
  type ProblemLayout,
} from "./split-layout";

/**
 * The problem page's layout choice and divider position, remembered in this browser.
 *
 * Both are preferences, not state anyone else needs: a student who prefers the split wants it on
 * the next problem and after a reload, and nothing breaks when storage is blocked. Every read and
 * write is guarded, because a private window or a locked-down school profile can make
 * `localStorage` throw on access.
 *
 * Shaped for `useSyncExternalStore`, like `rememberedLanguageStore`, so there is no effect racing
 * the first render to apply the stored value.
 */

const LAYOUT_KEY = "ptcn.problem-layout.v1";
const SPLIT_KEY = "ptcn.problem-split.v1";

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Blocked or full: the choice still holds for this page, it just is not remembered.
  }
}

/*
  What the page shows when storage cannot hold the choice. Without this a blocked localStorage
  would make the toggle do nothing at all, since the snapshot is re-read from storage on render.
*/
let layoutInMemory: ProblemLayout | null = null;
let splitInMemory: number | null = null;

export function rememberLayout(layout: ProblemLayout): void {
  layoutInMemory = layout;
  write(LAYOUT_KEY, layout);
  notify();
}

export function rememberSplit(split: number): void {
  splitInMemory = split;
  write(SPLIT_KEY, String(split));
  notify();
}

export const layoutStore = {
  subscribe,
  getSnapshot: (): ProblemLayout => {
    const stored = read(LAYOUT_KEY);
    return stored === null && layoutInMemory !== null ? layoutInMemory : parseLayout(stored);
  },
  getServerSnapshot: (): ProblemLayout => parseLayout(null),
};

export const splitStore = {
  subscribe,
  getSnapshot: (): number => {
    const stored = read(SPLIT_KEY);
    return stored === null && splitInMemory !== null ? splitInMemory : parseSplit(stored);
  },
  getServerSnapshot: (): number => parseSplit(null),
};

const WIDE_QUERY = `(min-width: ${SIDE_BY_SIDE_MIN_WIDTH_PX}px)`;

/** Whether the window is wide enough for two panes. False on the server and on phones. */
export const wideViewportStore = {
  subscribe(listener: () => void): () => void {
    const query = window.matchMedia(WIDE_QUERY);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  },
  getSnapshot: (): boolean => window.matchMedia(WIDE_QUERY).matches,
  getServerSnapshot: (): boolean => false,
};
