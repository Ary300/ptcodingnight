"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { SPLIT_MAX, SPLIT_MIN, splitAfterKey, splitFromPointer } from "./split-layout";
import { rememberSplit, splitStore } from "./split-preference";

/**
 * Two full-height panes with a divider between them: HackerRank's test editor, the statement on
 * the left and the editor on the right.
 *
 * ## The box
 *
 * The split is exactly as tall as its parent (`h-full`), and the parent is the window less the
 * site's top bar (`full-bleed.ts`). Neither pane scrolls the page: each is a column the caller
 * fills with fixed rows and one scrolling region of its own, so the statement scrolls while the
 * editor and its Submit button stay where they are.
 *
 * ## The divider
 *
 * The WAI-ARIA window splitter: `role="separator"`, focusable, valued as the LEFT pane's share in
 * percent. It is a 1px rule the full height of the workspace inside an 8px target, with a grip
 * at its middle that firms up on hover, focus and drag, so the rule reads as something to take
 * hold of rather than as a border. Pointer drag uses pointer capture, so the drag keeps tracking
 * over the textarea and past the window edge. Arrows step 5%, Home and End jump to the 25% and
 * 75% bounds. The ratio is remembered once a drag ends rather than on every move, because each
 * write notifies the store.
 *
 * ## Stacked is a mode of this component, not another tree
 *
 * The "Stacked" layout is the same three slots with the divider taken out: the start pane above,
 * the end pane below, the page scrolling. It lives here rather than in a second component because
 * the end pane holds the editor. With two trees, every switch (the toggle, the window crossing
 * 1024px, a browser zoom) rebuilt the textarea: focus fell to <body> mid-word, the caret went to
 * 0, and the undo history was gone, since Chrome drops a node's undo steps when it leaves the
 * page. Here the root and both panes are the same elements in both layouts and only their classes
 * change, so React keeps every node under them that the caller keeps in the same place.
 */

export interface SplitPanesProps {
  readonly start: ReactNode;
  readonly end: ReactNode;
  /** Accessible names for the two panes, which are regions. */
  readonly startLabel: string;
  readonly endLabel: string;
  /** One pane above the other with no divider: the "Stacked" layout. See the note above. */
  readonly stacked?: boolean;
  /** Classes for the root, stacked only; the split's root is sized by the frame. */
  readonly stackedClassName?: string;
}

export function SplitPanes({
  start,
  end,
  startLabel,
  endLabel,
  stacked = false,
  stackedClassName = "",
}: SplitPanesProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const startId = useId();

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
      className={
        stacked
          ? stackedClassName
          : `flex h-full min-h-0 w-full ${dragging ? "cursor-col-resize select-none" : ""}`
      }
    >
      <section
        id={startId}
        aria-label={startLabel}
        data-split-pane="start"
        className={stacked ? "min-w-0" : "flex min-h-0 min-w-0 shrink-0 flex-col bg-paper"}
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
        title="Drag to resize, or focus and use the arrow keys"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
        // Inset ring: the divider runs the full height of a frame that clips at the window's
        // bottom edge, so the global 2px offset ring would lose its top and bottom.
        className="group relative z-10 flex w-2 shrink-0 cursor-col-resize touch-none justify-center focus-visible:outline-offset-[-2px]!"
      >
        {/* The rule, full height. Firm while dragged, hovered or focused, so the student sees what moves. */}
        <span
          aria-hidden="true"
          className={`h-full w-px transition-colors duration-[var(--motion-press)] group-hover:bg-panther group-focus-visible:bg-panther ${
            dragging ? "bg-panther" : "bg-rule-edge"
          }`}
        />
        {/* The grip: quiet at rest, a filled handle under the pointer or the keyboard. */}
        <span
          aria-hidden="true"
          className={`absolute top-1/2 flex h-12 w-2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-chip border transition-colors duration-[var(--motion-press)] group-hover:border-panther group-hover:bg-panther group-focus-visible:border-panther group-focus-visible:bg-panther ${
            dragging ? "border-panther bg-panther" : "border-rule-firm bg-paper"
          }`}
        >
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className={`h-0.5 w-0.5 rounded-full group-hover:bg-paper group-focus-visible:bg-paper ${
                dragging ? "bg-paper" : "bg-ink/60"
              }`}
            />
          ))}
        </span>
      </div>
      )}

      <section
        aria-label={endLabel}
        data-split-pane="end"
        // Stacked, it is the full-width panel below the statement.
        className={stacked ? "mt-8" : "flex min-h-0 min-w-0 flex-1 flex-col bg-paper"}
      >
        {end}
      </section>
    </div>
  );
}
