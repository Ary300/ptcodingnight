"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

import {
  SPLIT_MAX,
  SPLIT_MIN,
  splitAfterKey,
  splitBoxFor,
  splitFromPointer,
  type SplitBox,
} from "./split-layout";
import { rememberSplit, splitStore } from "./split-preference";

/**
 * Two panes side by side with a divider between them: HackerRank's split, the statement on the
 * left and the work on the right.
 *
 * ## The box
 *
 * The split fills the window from its own top edge down, so on arrival the Submit button is on
 * screen and each pane scrolls by itself: a student scrolls the statement while the editor stays
 * where it is. It also widens past the page's 1120px content column to a 16px gutter from the
 * window edge, because two halves of that column leave the editor about 70 characters.
 *
 * Both numbers are measured rather than written in CSS. The top is summed from `offsetTop`, which
 * ignores transforms, because the workspace rises in on a transform animation and a
 * `getBoundingClientRect` taken mid-rise would be 3px off for good.
 *
 * ## The divider
 *
 * The WAI-ARIA window splitter: `role="separator"`, focusable, valued as the LEFT pane's share in
 * percent. Pointer drag uses pointer capture, so the drag keeps tracking over the textarea and
 * past the window edge. Arrows step 5%, Home and End jump to the 30% and 70% bounds. The ratio is
 * remembered once a drag ends rather than on every move, because each write notifies the store.
 */

export interface SplitPanesProps {
  readonly start: ReactNode;
  readonly end: ReactNode;
  /** Accessible names for the two panes, which are regions. */
  readonly startLabel: string;
  readonly endLabel: string;
  readonly className?: string;
  /**
   * One pane above the other, with no divider: the "Stacked" layout. It is a mode of this
   * component rather than a different tree on purpose. The end pane holds the editor, and if the
   * two layouts were different trees, every switch (the toggle, the window crossing 1024px, a
   * browser zoom) would rebuild the textarea: focus to <body> mid-word, the caret to 0, and the
   * browser's undo history gone, since Chrome drops a node's undo steps when it leaves the page.
   * Here the end pane is the same element in both layouts, and only its classes change.
   */
  readonly stacked?: boolean;
}

function documentTop(element: HTMLElement): number {
  let top = 0;
  let current: HTMLElement | null = element;
  while (current !== null) {
    top += current.offsetTop;
    current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null;
  }
  return top;
}

function useSplitBox(rootRef: RefObject<HTMLDivElement | null>): SplitBox | null {
  const [box, setBox] = useState<SplitBox | null>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const column = root?.parentElement ?? null;
    if (root === null || column === null) return;
    const measure = () => {
      const next = splitBoxFor({
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: window.innerHeight,
        columnWidth: column.clientWidth,
        topInDocument: documentTop(root),
      });
      setBox((previous) =>
        previous !== null && previous.bleed === next.bleed && previous.height === next.height
          ? previous
          : next,
      );
    };
    measure();
    // The column resizes with the window, and the title above can rewrap and move the top.
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [rootRef]);
  return box;
}

export function SplitPanes({ start, end, startLabel, endLabel, className, stacked = false }: SplitPanesProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const startId = useId();
  const box = useSplitBox(rootRef);

  const stored = useSyncExternalStore(
    splitStore.subscribe,
    splitStore.getSnapshot,
    splitStore.getServerSnapshot,
  );
  // The ratio under the pointer mid-drag. A ref too, so ending the drag twice (pointerup, then
  // lostpointercapture) remembers it once and never a stale value.
  const [dragged, setDragged] = useState<number | null>(null);
  const draggedRef = useRef<number | null>(null);
  const split = dragged ?? stored;

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (root === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = root.getBoundingClientRect();
    const next = splitFromPointer(event.clientX, rect.left, rect.width);
    draggedRef.current = next;
    setDragged(next);
  }, []);

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const final = draggedRef.current;
    draggedRef.current = null;
    if (final !== null) rememberSplit(final);
    setDragged(null);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const next = splitAfterKey(split, event.key);
      if (next === null) return;
      event.preventDefault();
      rememberSplit(next);
    },
    [split],
  );

  const dragging = dragged !== null;

  return (
    <div
      ref={rootRef}
      data-split-root=""
      data-layout={stacked ? "stacked" : "split"}
      className={`${stacked ? "" : "flex"} ${dragging ? "cursor-col-resize select-none" : ""} ${className ?? ""}`}
      style={
        stacked || box === null
          ? undefined
          : { height: `${box.height}px`, marginLeft: `${-box.bleed}px`, marginRight: `${-box.bleed}px` }
      }
    >
      <section
        id={startId}
        aria-label={startLabel}
        data-split-pane="start"
        className={stacked ? "min-w-0" : "min-w-0 shrink-0 overflow-y-auto overscroll-contain pt-1 pr-4 pb-6"}
        style={stacked ? undefined : { flexBasis: `${split}%` }}
      >
        {start}
      </section>

      {/* Absent when stacked, but its slot stays, so the end pane after it is never rebuilt. */}
      {stacked ? null : (
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-controls={startId}
          aria-label="Resize the problem and the editor"
          aria-valuenow={split}
          aria-valuemin={SPLIT_MIN}
          aria-valuemax={SPLIT_MAX}
          aria-valuetext={`Problem ${split}%, editor ${100 - split}%`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onKeyDown={onKeyDown}
          className="group relative flex w-3 shrink-0 cursor-col-resize touch-none justify-center"
        >
          {/* The rule, full height. Firm while dragged or focused so the student sees what moves. */}
          <span
            aria-hidden="true"
            className={`h-full w-px transition-colors duration-[var(--motion-press)] group-hover:bg-panther group-focus-visible:bg-panther ${
              dragging ? "bg-panther" : "bg-rule-edge"
            }`}
          />
          {/* The grip, so the rule reads as something to take hold of rather than a border. */}
          <span
            aria-hidden="true"
            className={`absolute top-1/2 h-10 w-1.5 -translate-y-1/2 rounded-chip border transition-colors duration-[var(--motion-press)] group-hover:border-panther group-hover:bg-panther group-focus-visible:border-panther group-focus-visible:bg-panther ${
              dragging ? "border-panther bg-panther" : "border-rule-firm bg-paper"
            }`}
          />
        </div>
      )}

      <section
        aria-label={endLabel}
        data-split-pane="end"
        // A flex column, so the editor panel inside can take the height the actions and the
        // verdict leave. `px-1` and `pt-1` keep the editor's focus ring, drawn 2px outside the
        // textarea, inside this pane's scroll box where it cannot be clipped. Stacked, it is the
        // full-width panel below the statement.
        className={
          stacked ? "mt-8" : "flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain pt-1 pr-1 pb-6 pl-4"
        }
      >
        {end}
      </section>
    </div>
  );
}
