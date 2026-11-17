/**
 * Which half of the problem page's statement pane is showing: the problem, or this problem's
 * submissions.
 *
 * It lives in the URL as `?tab=submissions`, so a refresh, a back-and-forward or a shared link
 * keeps it. The Problem tab is the URL with no `tab` at all, which keeps every existing link to a
 * problem meaning what it meant.
 *
 * Switching writes the address with `history.replaceState`, never a navigation. A navigation would
 * re-render the route, and the editor below the tabs holds a student's unsubmitted code, caret and
 * undo history; only the statement pane may change. Replace rather than push, so Back still leaves
 * the problem the way it did before the tab existed, instead of walking back through every switch.
 */

export type ProblemTab = "problem" | "submissions";

export const PROBLEM_TABS: readonly ProblemTab[] = ["problem", "submissions"];

const PARAM = "tab";
const SUBMISSIONS_VALUE = "submissions";
/** Fired after a switch, because `replaceState` itself raises no event to subscribe to. */
const CHANGE_EVENT = "ptcn:problem-tab";

/** The tab a query string asks for. Anything unrecognised is the Problem tab. */
export function tabFromSearch(search: string): ProblemTab {
  return new URLSearchParams(search).get(PARAM) === SUBMISSIONS_VALUE ? "submissions" : "problem";
}

/** The query string with `tab` set for this tab, every other parameter kept in its order. */
export function searchWithTab(search: string, tab: ProblemTab): string {
  const params = new URLSearchParams(search);
  if (tab === "submissions") params.set(PARAM, SUBMISSIONS_VALUE);
  else params.delete(PARAM);
  const next = params.toString();
  return next === "" ? "" : `?${next}`;
}

export const problemTabStore = {
  subscribe(onChange: () => void): () => void {
    window.addEventListener("popstate", onChange);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  },
  getSnapshot(): ProblemTab {
    return tabFromSearch(window.location.search);
  },
  getServerSnapshot(): ProblemTab {
    return "problem";
  },
};

/** Shows a tab and records it in the address without navigating. */
export function selectProblemTab(tab: ProblemTab): void {
  const { pathname, search, hash } = window.location;
  const nextSearch = searchWithTab(search, tab);
  if (nextSearch === search) return;
  // `null` state, as Next.js documents for its own integration with the native history methods:
  // the router keeps its entry and `useSearchParams` stays in step.
  window.history.replaceState(null, "", `${pathname}${nextSearch}${hash}`);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
