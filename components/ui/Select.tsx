"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

/**
 * The one dropdown in this product: trigger, popup and all.
 *
 * ## The open list used to be the operating system's, and that is what changed
 *
 * A previous study measured HackerRank's dropdown and concluded we keep the platform control.
 * Its trigger conclusions were right and are kept verbatim below. Its POPUP conclusions were
 * measured against something else: it recorded "no focus indicator at all" and "hover and
 * selected render identically at 2.9:1", and the reference capture of HackerRank's open Type
 * dropdown shows a solid near-black selected row, white text, and a 1px black ring 2px outside
 * it. That is a focus indicator, and it is not 2.9:1.
 *
 * Four things in that capture are impossible for a native `<select>`: the chevron flips to point
 * up while the list is open, the list is an in-page panel drawn above the greyed page, the
 * selected row carries a ring drawn INSIDE the list, and a text caret sits before the value in
 * the trigger. HackerRank's dropdowns are custom listboxes. Ours were the operating system's.
 *
 * The evidence that settled it is a pixel diff. With our select demonstrably open, a capture of
 * the 700px BELOW the trigger differs from the closed capture in exactly zero pixels: every
 * changed pixel lies inside the trigger box and is our own focus ring. The list was never in the
 * document. It could not be styled, could not be screenshotted, could not be reached by axe, and
 * could not be asserted on: there is no `selectOption` call anywhere in the suite and no a11y
 * spec that opens a list, so G7 and G9 were green over a control whose principal state had never
 * once been executed. An `<option>` has no layout box at all, either: set `background`,
 * `font-size` and `padding` on one and the computed style accepts every value while
 * `getBoundingClientRect().height` stays 0.
 *
 * ## What is NOT thrown away
 *
 * Every original reason for going native was real, so each is bought back explicitly rather than
 * argued away:
 *
 * - **The phone wheel.** `useFinePointer` renders a real `<select>` on a coarse pointer. It is a
 *   feature query, not a user-agent string, and it starts `false` so the SERVER and the first
 *   client paint both emit the native control. A student whose JavaScript has not arrived gets a
 *   working dropdown, and there is no hydration mismatch to reconcile.
 * - **Keyboard completeness.** The full APG select-only combobox pattern is implemented below,
 *   including type-ahead, `Home`/`End`, `PageUp`/`PageDown`, and `Escape` returning focus.
 * - **Screen-reader semantics.** The trigger is a `role="combobox"` button with `aria-expanded`
 *   and `aria-activedescendant`; the panel is a real `role="listbox"` of `role="option"` items
 *   with `aria-selected`. A listbox whose rows are divs would be a regression however good it
 *   looks.
 *
 * ## `appearance: base-select` was rejected, and not on taste
 *
 * The bundled Chromium answers `CSS.supports("appearance", "base-select")` with `true` and the
 * in-page picker it produces is a fraction of this code. It is Chromium-only in 2026. Students
 * bring their own laptops, so a Safari student and a Chrome student would be looking at two
 * different products in the same room, and our own screenshots would stop describing what half
 * of it sees. Revisit when all three engines ship it.
 *
 * ## Why the callers did not change
 *
 * The natural API for a listbox is an options ARRAY, and `Listbox` below offers exactly that. But
 * every existing caller passes `<option>` children and reads `event.target.value`, and rewriting
 * six screens in the same change that replaces the control is how a UI change becomes a data
 * change. So `Select` keeps its own signature and derives the options from its children, and the
 * commit goes through a real, hidden `<select>` using the native value setter plus a dispatched
 * `change` event. The handler a caller wrote against the platform control receives a genuine
 * React `ChangeEvent` whose `target` is a genuine `HTMLSelectElement`. Nothing at a call site can
 * tell the difference, which is the point: the blast radius of this file is this file.
 *
 * ## Still a native `<select>` on the trigger's metrics, and those are unchanged
 *
 * The trigger measurements below were settled by the earlier study and are NOT re-derived here.
 * Four screens drew a trigger, all four differently. Measured on this machine at 1440:
 *
 * | | height | radius | border | font |
 * |---|---|---|---|---|
 * | the editor's language picker | 34px | 4px (raw `rounded`) | `ink/25` | 12.8px |
 * | every admin select | 42px | 0px (`--radius-flat`) | `--rule-edge` (ink/18) | 16px |
 * | the admin TEXT input beside it | 42px | 0px | `--rule-edge` | 16px |
 *
 * Neither `4px` nor `ink/25` is a token. DESIGN.md §5a has three radii and §5b has three rule
 * weights, and the language picker was off both scales — it is one of the eleven hand-picked
 * `border-ink/N` alphas §5b exists to have deleted.
 *
 * ## `appearance: none` on the native branch
 *
 * It styles the CLOSED control only; the open list on a phone is still the platform's, so the
 * wheel is untouched. What it buys is the chevron: the browser default is a small stacked
 * double-triangle, it differs per platform and per browser, and the control reserved no room for
 * it. Measured at 360px with a long team name, the label ran to 13px from the right edge and the
 * arrow sits inside that, so the text was clipped hard against the glyph with no gutter at all —
 * screenshot `compare-overlap.png`. Ours is one thin stroke like HackerRank's (measured on their
 * Create Contest form: single chevron, ~10px wide, centred ~19px in from the right edge), and
 * `CHEVRON_CLEARANCE` stops the text 37px in, so no label can reach it.
 *
 * ## Why the surface is exported rather than copied
 *
 * `components/admin/Field.tsx` puts `CONTROL_SURFACE` on its text input and textarea too. A
 * select four pixels shorter than the input beside it in the same grid row is precisely the
 * defect this file exists to end, and two hand-maintained copies of `px-3 py-2 border …` is how
 * it comes back six weeks later. The listbox trigger reuses the same constants for the same
 * reason: a `<button>` and a `<select>` that must be indistinguishable when closed cannot be
 * allowed two class lists.
 *
 * ## Disabled is a skin, not an opacity
 *
 * The same rule `components/ui/Button.tsx` already states: `opacity` over a live-looking control
 * reads as enabled-and-broken, and it MULTIPLIES with the child alpha, so `disabled:opacity-60`
 * over `placeholder:text-ink/60` landed placeholder text at 0.36. Disabled is a different kind
 * of object here (flat fill, hairline rule, muted ink, no pointer) rather than a faded live one.
 */

/** `sm` for dense chrome (the editor header bar), `md` for a form row. Defaults to `md`. */
export type SelectSize = "sm" | "md";

/**
 * Surface, corner, rule weight and the disabled skin: everything a control's box has that is
 * not its padding or its type face. Shared with `components/admin/Field.tsx`.
 *
 * ## The corner is 4px, measured off HackerRank, and it is deliberately not `--radius-flat`
 *
 * Every select and every input in every reference screenshot (`12.23.42`, `12.24.35`,
 * `12.24.25`, the editor picker in `hr-challenge-live.png`) has a ~4px corner. Our controls
 * shipped at `--radius-flat` = 0px, and the inventory called that the single largest systemic
 * mismatch in the product. Raw `rounded` is Tailwind's 4px and is what the reference-matching
 * sign-in inputs already use, so the two halves of the product now agree.
 *
 * §5a's taxonomy survives this: a rectangle that HOLDS DATA (table cell, code block) stays
 * flat at 0px; a CONTROL is rounded; a SECTION is 8px. What moves is only which bucket a
 * form control belongs to. The remaining debt is that 4px is off the three-radius token
 * scale — globals.css is orchestrator-owned, so the promotion to a `--radius-control: 4px`
 * token (and folding `--radius-chip` 3px into it) is requested in the Group C report rather
 * than done here. `components/ui/Button.tsx` carries the same raw `rounded` for the same
 * reason, and the popup panel below is now the third consumer; if one changes, change all.
 *
 * ## Focus changes the control's OWN border, not just the outer ring
 *
 * HackerRank's focused control darkens its border (near-black in the signup modal, blue plus
 * a halo in the admin). Ours kept `--rule-edge` and relied on the global 2px panther outline
 * alone, so a focused-but-not-hovered select's box looked identical to a resting one inside
 * the ring — and the outline is `:focus-visible`, so a MOUSE focus showed nothing at all.
 * `focus:border-ink` (in `borderFor` below, valid branch only) is the reference's darkened
 * border in our palette; the global panther outline remains the halo. Invalid controls keep
 * `--panther` even focused, because the error signal outranks the focus signal and the two
 * would otherwise be indistinguishable reds.
 */
export const CONTROL_SURFACE =
  // `transition-[border-color]` and NOT `transition-colors`: in Tailwind v4 that shorthand
  // includes `outline-color`, and the focus ring is an outline. Measured with it on, tabbing
  // into a select FADED the ring up from ink to `--panther` over 150ms — the one indicator a
  // keyboard-only user has, arriving late and washed out. The border is the only colour here
  // that has any business animating.
  "w-full rounded border bg-paper text-ink transition-[border-color] " +
  "disabled:cursor-not-allowed disabled:border-rule-hair disabled:bg-ink/5 disabled:text-ink/40";

/** Padding by size. The select adds its own right padding to clear the chevron. */
export const CONTROL_PAD: Record<SelectSize, string> = {
  sm: "px-2.5 py-1.5",
  md: "px-3 py-2",
};

/**
 * The line box, pinned rather than left to the font's `normal`.
 *
 * This is what makes "the select is the same height as the input beside it" a fact instead of a
 * coincidence. Height is padding + border + line box; the first two were already shared, and the
 * third was whatever each browser computes `normal` to be for Libre Baskerville at that size.
 * It happens to be exactly 24px in this Chromium, which is why `md` reads 42px on both today —
 * but `appearance: none` also drops the UA's own minimum height on the select and not on the
 * input, so the two were one font metric away from stepping apart again on somebody's Firefox.
 *
 * It now carries a second load: the listbox trigger is a `<button>`, whose UA line box is not a
 * select's. Pinning it is what keeps the two branches of `Select` the same height on the same
 * screen, which nobody would ever notice being wrong because nobody sees both.
 */
export const CONTROL_LEADING: Record<SelectSize, string> = {
  sm: "leading-5",
  md: "leading-6",
};

/** Type size by size, as a token rather than a Tailwind step. */
export const CONTROL_FONT_SIZE: Record<SelectSize, string> = {
  sm: "var(--text-xs)",
  md: "var(--text-sm)",
};

/**
 * Right padding that clears the chevron, so no option label can ever run under it.
 * `sm` reserves 28px for a 9px glyph inset 8px; `md` reserves 36px for a 10px glyph inset 12px.
 */
const CHEVRON_CLEARANCE: Record<SelectSize, string> = {
  sm: "pr-7",
  md: "pr-9",
};

const CHEVRON_POSITION: Record<SelectSize, string> = {
  sm: "right-2",
  md: "right-3",
};

const CHEVRON_BOX: Record<SelectSize, { width: number; height: number }> = {
  sm: { width: 9, height: 6 },
  md: { width: 10, height: 6 },
};

/**
 * Row box by trigger size: 32px under a 34px trigger, 40px under a 42px one.
 *
 * HackerRank runs two row heights for two control heights — ~32px rows under its ~28px authoring
 * control, and 41px rows under its 40px account menu — so the list is scaled to the control
 * rather than to a global menu metric. The horizontal padding matches `CONTROL_PAD`, which puts
 * the row's leading glyph on the same vertical line as the trigger's own text.
 */
const ROW_PAD: Record<SelectSize, string> = {
  sm: "px-2.5",
  md: "px-3",
};

/**
 * The row height in pixels, and it is a NUMBER rather than `h-8`/`h-10` on purpose.
 *
 * The placement maths below has to know how tall the list will be before it exists, and a
 * Tailwind class cannot be read back. Two constants that must agree is one constant too many, so
 * the number is the truth and the row wears it as an inline height.
 */
const ROW_HEIGHT: Record<SelectSize, number> = {
  sm: 32,
  md: 40,
};

/** The panel's own 6px padding top and bottom plus its 1px rule on each side. */
const PANEL_CHROME = 14;

/** HackerRank's panel sits ~7px below its trigger. */
const PANEL_GAP = 6;

/**
 * Ten `sm` rows or eight `md` rows, and the arithmetic is the point rather than the round number.
 *
 * 10 × 32 + 14 = 334, and 8 × 40 + 14 = 334 as well. A flat 320 clips the tenth row by fourteen
 * pixels, which puts a scrollbar on the LANGUAGE PICKER: the one list in the product that is
 * exactly ten long and the one a student opens most.
 */
const PANEL_MAX_HEIGHT = 334;

/** Never let the panel touch the viewport edge. */
const PANEL_MARGIN = 8;

/** APG's type-ahead buffer lifetime. */
const TYPE_AHEAD_RESET_MS = 500;

/** `PageUp`/`PageDown` move this many enabled options, clamped at the ends. */
const PAGE_STEP = 10;

/**
 * `--rule-edge` at rest, `--rule-firm` on hover. Both are §5b weights; the hover is a real
 * affordance rather than decoration, and it is not colour ALONE because `cursor-pointer`
 * changes at the same moment.
 *
 * `--panther` when invalid. It is 5.08:1 on paper — AA, and the one palette colour DESIGN.md §2
 * lets carry meaning here. Never the only channel: `Field` renders the message in the same red
 * beneath the control and points `aria-describedby` at it.
 */
function borderFor(invalid: boolean): string {
  // `focus:` is emitted after `hover:` in Tailwind's variant order, so a hovered focused
  // control settles on ink rather than flickering between the two weights.
  return invalid
    ? "border-panther"
    : "border-rule-edge hover:border-rule-firm focus:border-ink";
}

/** The class list a closed trigger wears, whether it is a `<select>` or a `<button>`. */
function triggerClassName(size: SelectSize, invalid: boolean, lead: string): string {
  return [
    lead,
    CONTROL_SURFACE,
    CONTROL_PAD[size],
    CONTROL_LEADING[size],
    CHEVRON_CLEARANCE[size],
    borderFor(invalid),
  ].join(" ");
}

/**
 * Decorative: the accessible name is the label, and the fact that this is a dropdown is already
 * in the control's role. Announcing "chevron" here would be noise.
 *
 * `pointer-events-none` so the glyph is not a dead zone — clicking the arrow is how most people
 * open a dropdown, and an interactive-looking span that swallows the click is worse than no
 * arrow at all.
 *
 * It rotates while the list is open because HackerRank's does, and because with the popup drawn
 * elsewhere in the document the trigger otherwise carries no evidence of its own state at all.
 */
function Chevron({ size, open }: { size: SelectSize; open: boolean }) {
  const glyph = CHEVRON_BOX[size];

  return (
    <span
      aria-hidden="true"
      // Full ink, not an alpha: the reference glyph is near-black (measured on the Create
      // Contest form and the editor picker), and ours read one shade too light beside it.
      className={[
        "pointer-events-none absolute",
        CHEVRON_POSITION[size],
        "text-ink transition-transform motion-reduce:transition-none peer-disabled:text-ink/40",
        open ? "rotate-180" : "",
      ].join(" ")}
    >
      <svg
        width={glyph.width}
        height={glyph.height}
        viewBox="0 0 10 6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <path d="M1 1L5 5L9 1" />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------------------------------ *
 * Options
 * ------------------------------------------------------------------------------------------ */

export interface ListboxOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
}

interface OptionLikeProps {
  readonly value?: string | number | readonly string[];
  readonly disabled?: boolean;
  readonly children?: ReactNode;
}

/**
 * The visible text of an `<option>`, flattened.
 *
 * Call sites write real sentences into these: `{team.name} ({team.memberCount} members)` and
 * `{option} - {verdictName(option)}` both arrive as an ARRAY of strings and numbers, not as one
 * string, so reading `props.children` and hoping it is text produces `[object Object]` on
 * precisely the two screens an organizer uses most.
 */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => textOf(child as ReactNode)).join("");
  if (isValidElement(node)) {
    const props = node.props as OptionLikeProps;
    return textOf(props.children);
  }
  return "";
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Read `<option>` children into the array a listbox needs.
 *
 * Exported so it can be tested without a DOM: it is the one piece of this file where a silent
 * wrong answer (a dropped `disabled`, a label read as `[object Object]`) looks like a rendering
 * bug rather than a parsing one.
 */
export function optionsFromChildren(children: ReactNode): readonly ListboxOption[] {
  const found: ListboxOption[] = [];

  const walk = (nodes: ReactNode): void => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      const props = child.props as OptionLikeProps;

      // A fragment or an `<optgroup>` is a container, not an option. `Children.forEach` already
      // flattens the arrays that `.map()` produces, but it treats a fragment as one child.
      if (child.type === Fragment || child.type === "optgroup") {
        walk(props.children);
        return;
      }
      if (child.type !== "option") return;

      const label = collapse(textOf(props.children));
      found.push({
        // An `<option>` with no `value` takes its text as its value, exactly as the DOM does.
        value: props.value === undefined ? label : String(props.value),
        label,
        disabled: props.disabled === true,
      });
    });
  };

  walk(children);
  return found;
}

/* ------------------------------------------------------------------------------------------ *
 * Movement, as pure functions
 * ------------------------------------------------------------------------------------------ */

/**
 * One step, skipping disabled options, and NOT wrapping.
 *
 * Native macOS does not wrap, and wrapping combined with type-ahead is disorienting: the cursor
 * appears to jump backwards for a reason the reader cannot see.
 */
export function stepIndex(
  options: readonly ListboxOption[],
  from: number,
  step: 1 | -1,
): number {
  for (let i = from + step; i >= 0 && i < options.length; i += step) {
    if (options[i]?.disabled !== true) return i;
  }
  return from;
}

/** The first (`1`) or last (`-1`) enabled option, or `-1` when every option is disabled. */
export function edgeIndex(options: readonly ListboxOption[], direction: 1 | -1): number {
  const start = direction === 1 ? 0 : options.length - 1;
  for (let i = start; i >= 0 && i < options.length; i += direction) {
    if (options[i]?.disabled !== true) return i;
  }
  return -1;
}

/** `PAGE_STEP` enabled options away, clamped rather than wrapped. */
export function pageIndex(
  options: readonly ListboxOption[],
  from: number,
  direction: 1 | -1,
): number {
  let index = from;
  for (let taken = 0; taken < PAGE_STEP; taken += 1) {
    const next = stepIndex(options, index, direction);
    if (next === index) break;
    index = next;
  }
  return index;
}

/**
 * Type-ahead, cyclic, case-insensitive, skipping disabled options.
 *
 * A buffer of one character (or of the same character repeated, which is what holding `g` does)
 * searches from the option AFTER the active one, so repeats cycle through everything sharing an
 * initial. A longer buffer searches from the active option INCLUSIVE, so that continuing to type
 * a word the cursor is already sitting on does not walk away from it.
 */
export function typeAheadIndex(
  options: readonly ListboxOption[],
  buffer: string,
  from: number,
): number {
  if (buffer === "" || options.length === 0) return -1;

  const repeated = [...buffer].every((character) => character === buffer[0]);
  const needle = (repeated ? buffer.slice(0, 1) : buffer).toLowerCase();
  const anchor = from < 0 ? 0 : from;
  const offset = repeated ? 1 : 0;

  for (let taken = 0; taken < options.length; taken += 1) {
    const index = (anchor + offset + taken) % options.length;
    const option = options[index];
    if (option === undefined || option.disabled === true) continue;
    if (option.label.toLowerCase().startsWith(needle)) return index;
  }
  return -1;
}

/* ------------------------------------------------------------------------------------------ *
 * The popup
 * ------------------------------------------------------------------------------------------ */

interface PanelBox {
  /** Set when the list drops below the trigger. */
  readonly top?: number;
  /** Set when it flips above, so the panel is anchored by the edge that touches the trigger. */
  readonly bottom?: number;
  readonly left: number;
  readonly width: number;
  readonly maxHeight: number;
}

/**
 * Where the panel goes, measured once per open.
 *
 * It is `position: fixed` and portalled to `<body>` rather than absolutely positioned inside the
 * trigger's shell, because an absolutely positioned panel is clipped by any ancestor with
 * `overflow` set — and one of the six host screens is twenty selects inside a bordered table
 * card, which is exactly the shape that clips. Fixed positioning normally costs you
 * repositioning on scroll; here it costs nothing, because an ancestor scrolling CLOSES the list.
 *
 * ## Two things here were bugs, both visible only in a screenshot
 *
 * **The flipped panel is anchored by its BOTTOM.** Anchoring it by `top = triggerTop - gap -
 * maxHeight` positions the box the list is ALLOWED to fill, not the box it fills: a two-row list
 * under a 334px cap floated 256px above its own trigger, attached to nothing, in the middle of
 * the page. Captured on the line-up screen.
 *
 * **The choice of side is made against the list's NATURAL height, not the cap.** Comparing the
 * space below against the cap flips a two-row list upward whenever it sits below the fold, which
 * is both unexpected and unnecessary. Rows are a known height, so the height is known before the
 * list exists.
 */
function measure(trigger: HTMLElement, size: SelectSize, count: number): PanelBox {
  const rect = trigger.getBoundingClientRect();
  const natural = Math.min(count * ROW_HEIGHT[size] + PANEL_CHROME, PANEL_MAX_HEIGHT);
  const below = window.innerHeight - rect.bottom - PANEL_GAP - PANEL_MARGIN;
  const above = rect.top - PANEL_GAP - PANEL_MARGIN;
  const dropDown = below >= natural || below >= above;
  const room = Math.max(dropDown ? below : above, 0);
  // Never smaller than one row: a panel too short to show anything is worse than one that runs
  // to the edge of the window.
  const maxHeight = Math.max(Math.min(natural, room), ROW_HEIGHT[size]);

  return dropDown
    ? { top: rect.bottom + PANEL_GAP, left: rect.left, width: rect.width, maxHeight }
    : {
        bottom: window.innerHeight - rect.top + PANEL_GAP,
        left: rect.left,
        width: rect.width,
        maxHeight,
      };
}

/**
 * The popup listbox needs its own accessible name, and it cannot inherit the trigger's.
 *
 * Pointing `aria-labelledby` at the trigger would name the list after the SELECTED VALUE, since
 * name computation walks the referenced element's own subtree. So the name is read from whatever
 * actually labels the trigger: its `aria-label`, or the `<label for>` that `Field` renders.
 */
function nameForList(trigger: HTMLElement): string | undefined {
  const own = trigger.getAttribute("aria-label");
  if (own !== null && own.trim() !== "") return collapse(own);

  const id = trigger.getAttribute("id");
  if (id === null) return undefined;
  const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
  if (label === null) return undefined;

  // The decorative asterisk `Field` draws is `aria-hidden`, so it is not part of the trigger's
  // own accessible name and must not become part of the list's. Reading `textContent` straight
  // off the label named the popup "Scoring preset * (required)".
  const copy = label.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll("[aria-hidden='true']")) hidden.remove();
  const text = collapse(copy.textContent ?? "");
  return text === "" ? undefined : text;
}

interface ListboxControlProps {
  readonly options: readonly ListboxOption[];
  readonly value: string;
  readonly onCommit: (next: string) => void;
  readonly size: SelectSize;
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly required: boolean;
  readonly id?: string;
  readonly ariaLabel?: string;
  readonly ariaLabelledBy?: string;
  readonly ariaDescribedBy?: string;
  readonly shellClassName: string;
  readonly style?: CSSProperties;
  /**
   * A hidden native `<select>` the caller uses to raise a real change event. Rendered inside the
   * shell so there is exactly one place in the tree that owns this control.
   */
  readonly mirror?: ReactNode;
}

function ListboxControl({
  options,
  value,
  onCommit,
  size,
  invalid,
  disabled,
  required,
  id,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  shellClassName,
  style,
  mirror,
}: ListboxControlProps) {
  const base = useId();
  const listId = `${base}-list`;

  const shellRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLUListElement | null>(null);
  const rowsRef = useRef<(HTMLLIElement | null)[]>([]);
  const bufferRef = useRef("");
  const bufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One state for "open", because the panel cannot be drawn without its box and drawing it in
  // the wrong place for one frame is a visible flash on a 1920 projector.
  const [box, setBox] = useState<PanelBox | null>(null);
  const [listName, setListName] = useState<string | undefined>(undefined);
  const [activeIndex, setActiveIndex] = useState(-1);
  const open = box !== null;

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedLabel = options[selectedIndex]?.label ?? "";
  const activeId = activeIndex >= 0 ? `${base}-option-${activeIndex}` : undefined;

  const openList = (startAt: number): void => {
    const trigger = triggerRef.current;
    if (trigger === null || disabled || options.length === 0) return;
    setBox(measure(trigger, size, options.length));
    setListName(nameForList(trigger));
    setActiveIndex(startAt);
  };

  const closeList = (): void => {
    setBox(null);
    setActiveIndex(-1);
    bufferRef.current = "";
  };

  const returnFocus = (): void => {
    triggerRef.current?.focus();
  };

  const commitAt = (index: number): void => {
    const option = options[index];
    closeList();
    if (option !== undefined && option.disabled !== true && option.value !== value) {
      onCommit(option.value);
    }
  };

  /** Where the cursor starts: on the current value, else on the first thing that can be chosen. */
  const entryIndex = (): number =>
    selectedIndex >= 0 && options[selectedIndex]?.disabled !== true
      ? selectedIndex
      : edgeIndex(options, 1);

  const runTypeAhead = (character: string, startAt: number): number => {
    if (bufferTimerRef.current !== null) clearTimeout(bufferTimerRef.current);
    bufferRef.current += character;
    bufferTimerRef.current = setTimeout(() => {
      bufferRef.current = "";
    }, TYPE_AHEAD_RESET_MS);
    return typeAheadIndex(options, bufferRef.current, startAt);
  };

  useEffect(
    () => () => {
      if (bufferTimerRef.current !== null) clearTimeout(bufferTimerRef.current);
    },
    [],
  );

  /*
    An outside pointerdown closes the list without committing; scroll and resize follow it instead.

    `scroll` is listened for in the CAPTURE phase because a scroll event does not bubble, so a
    listener on `window` would never hear a scrolling DIV. The panel's own scrolling is excluded
    by containment, or moving the cursor down a ten-item list would close it on the first row
    that had to scroll into view.
  */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (shellRef.current?.contains(target) === true) return;
      if (panelRef.current?.contains(target) === true) return;
      setBox(null);
      setActiveIndex(-1);
    };
    /*
      Scroll and resize REPOSITION the panel; they do not close it.

      Closing on ancestor scroll was the first design and it shipped a real bug: clicking the
      trigger focuses it, the browser then scrolls the focused button fully into view, and that
      scroll event lands AFTER the click has opened the list - so on any page where the picker sat
      low enough for the focus-scroll to move the document, the panel closed in the same frame it
      opened. Measured on the problem page: pointerdown, focusin, click, scroll(document), closed.
      The admin form never showed it because its controls sit at the top of a short page.

      Re-measuring against the trigger keeps the panel attached to the control wherever the page
      goes, which is also what the reference UI does. Outside pointerdown and Escape still close.
    */
    const reposition = (): void => {
      const trigger = triggerRef.current;
      if (trigger !== null) setBox(measure(trigger, size, options.length));
    };
    const onScroll = (event: Event): void => {
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target) === true) return;
      reposition();
    };
    const onResize = (): void => {
      reposition();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, size, options.length]);

  /*
    Keep the active row in view, by scrolling the PANEL and nothing else.

    `scrollIntoView({ block: "nearest" })` is the obvious call and it is the wrong one here: it
    may also scroll an ancestor, and an ancestor scrolling is what closes this list. The list
    would shut itself the first time the cursor reached a row below the fold.
  */
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const row = rowsRef.current[activeIndex];
    const panel = panelRef.current;
    if (!row || !panel) return;

    const panelRect = panel.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < panelRect.top) {
      panel.scrollTop -= panelRect.top - rowRect.top;
    } else if (rowRect.bottom > panelRect.bottom) {
      panel.scrollTop += rowRect.bottom - panelRect.bottom;
    }
  }, [open, activeIndex]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    const printable =
      event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

    if (!open) {
      if (
        event.key === "Enter" ||
        event.key === " " ||
        event.key === "ArrowDown" ||
        event.key === "ArrowUp"
      ) {
        event.preventDefault();
        openList(entryIndex());
        return;
      }
      if (printable) {
        event.preventDefault();
        const start = entryIndex();
        const hit = runTypeAhead(event.key, start);
        openList(hit >= 0 ? hit : start);
      }
      /*
        A bare ArrowDown on a CLOSED native select changes the value without opening anything.
        That is not copied: in the editor it silently switches the language a student is about to
        submit in, and the only feedback is a word in a 208px box they are not looking at.
      */
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex(activeIndex < 0 ? edgeIndex(options, 1) : stepIndex(options, activeIndex, 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex(
          activeIndex < 0 ? edgeIndex(options, -1) : stepIndex(options, activeIndex, -1),
        );
        return;
      case "Home":
        event.preventDefault();
        setActiveIndex(edgeIndex(options, 1));
        return;
      case "End":
        event.preventDefault();
        setActiveIndex(edgeIndex(options, -1));
        return;
      case "PageDown":
        event.preventDefault();
        setActiveIndex(pageIndex(options, activeIndex < 0 ? edgeIndex(options, 1) : activeIndex, 1));
        return;
      case "PageUp":
        event.preventDefault();
        setActiveIndex(
          pageIndex(options, activeIndex < 0 ? edgeIndex(options, -1) : activeIndex, -1),
        );
        return;
      case "Escape":
        /*
          `stopPropagation` as well as `preventDefault`: an organizer closing this list inside a
          confirm dialog must not also close the dialog, and Escape is the one key where doing
          two things at once is indistinguishable from doing the wrong one.
        */
        event.preventDefault();
        event.stopPropagation();
        closeList();
        returnFocus();
        return;
      case "Tab":
        // Native commits on Tab and lets focus move on, so this does too. No preventDefault.
        commitAt(activeIndex);
        return;
      case "Enter":
        event.preventDefault();
        commitAt(activeIndex);
        returnFocus();
        return;
      case " ":
        // A space mid-word belongs to the type-ahead buffer; a space on its own commits.
        if (bufferRef.current !== "") break;
        event.preventDefault();
        commitAt(activeIndex);
        returnFocus();
        return;
      default:
        break;
    }

    if (printable) {
      event.preventDefault();
      const hit = runTypeAhead(event.key, activeIndex);
      if (hit >= 0) setActiveIndex(hit);
    }
  };

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={panelRef}
            id={listId}
            role="listbox"
            aria-label={listName}
            tabIndex={-1}
            style={{
              top: box.top,
              bottom: box.bottom,
              left: box.left,
              width: box.width,
              maxHeight: box.maxHeight,
            }}
            /*
              `onMouseDown` is swallowed so the trigger keeps focus while the pointer is inside
              the list. Focus never enters the panel: `aria-activedescendant` is what moves, and
              a panel that stole focus would have to hand it back on every exit path, which is
              four more places to get wrong.
            */
            onMouseDown={(event) => event.preventDefault()}
            /*
              The listbox IS the panel rather than sitting in a positioned wrapper. Measured: with
              a wrapper `<div>`, axe reported `region` against it on every screen with the list
              open, because a portalled element is outside the page's landmarks and a plain div
              full of content is exactly what that rule looks for. A widget is not page content,
              so making the outermost portalled node the widget itself is the honest fix rather
              than the suppression.
            */
            className="fixed z-50 overflow-y-auto overscroll-contain rounded border border-rule-edge bg-paper py-1.5 shadow-lg"
          >
            {options.map((option, index) => {
              const selected = option.value === value;
              const active = index === activeIndex;
              const rowDisabled = option.disabled === true;

              return (
                <li
                  key={`${option.value}-${index}`}
                  id={`${base}-option-${index}`}
                  ref={(node) => {
                    rowsRef.current[index] = node;
                  }}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={rowDisabled || undefined}
                  onPointerEnter={() => {
                    if (!rowDisabled) setActiveIndex(index);
                  }}
                  onClick={() => {
                    if (rowDisabled) return;
                    commitAt(index);
                    returnFocus();
                  }}
                  style={{ fontSize: CONTROL_FONT_SIZE[size], height: ROW_HEIGHT[size] }}
                  /*
                    Selected is `--paper` on `--panther`: 5.08:1, AA. Active is an ink wash,
                    which keeps its text at 15.77:1. Hover and the keyboard cursor are ONE
                    state rather than two, because two highlights in one list is a question
                    about which one Enter will take.
                  */
                  className={[
                    "relative flex select-none items-center gap-1.5",
                    ROW_PAD[size],
                    rowDisabled ? "cursor-not-allowed text-ink/40" : "cursor-pointer",
                    selected ? "bg-panther text-paper" : "",
                    !selected && active && !rowDisabled ? "bg-ink/8 text-ink" : "",
                    !selected && !active && !rowDisabled ? "text-ink" : "",
                  ].join(" ")}
                >
                  {/*
                    The cursor bar is a solid fill, never an alpha on panther, and it inverts on
                    the selected row: a panther bar on a panther ground is invisible, and the
                    selected row is exactly where the cursor STARTS.
                  */}
                  {active && (
                    <span
                      aria-hidden="true"
                      className={`absolute inset-y-0 left-0 w-0.5 ${selected ? "bg-paper" : "bg-panther"}`}
                    />
                  )}
                  {/*
                    The tick is DESIGN.md §3's second channel: selected must not be carried by
                    colour alone, and it is what keeps "selected" and "the cursor is here"
                    legible on the row that is both. Fixed gutter so no label shifts.
                    `aria-hidden` because `aria-selected` already says it out loud.
                  */}
                  <span aria-hidden="true" className="w-[1.5ch] shrink-0">
                    {selected ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <span
      ref={shellRef}
      className={`relative inline-flex min-w-0 items-center ${shellClassName}`}
    >
      {mirror}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? activeId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        onClick={() => (open ? closeList() : openList(entryIndex()))}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          // Backstop for focus leaving by a route that is not Tab or Escape.
          const next = event.relatedTarget;
          if (next instanceof Node && shellRef.current?.contains(next) === true) return;
          if (open) closeList();
        }}
        className={triggerClassName(
          size,
          invalid,
          "peer flex cursor-pointer items-center text-left disabled:cursor-not-allowed",
        )}
        style={{ fontSize: CONTROL_FONT_SIZE[size], ...style }}
      >
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
      </button>

      <Chevron size={size} open={open} />
      {panel}
    </span>
  );
}

/* ------------------------------------------------------------------------------------------ *
 * Pointer branch
 * ------------------------------------------------------------------------------------------ */

/**
 * `false` on the server AND through hydration, deliberately.
 *
 * The native `<select>` is what renders until an effect has confirmed a fine pointer, so the
 * markup the server emits is the markup the client hydrates, and a student whose JavaScript has
 * not arrived still has a working control rather than a button that does nothing. A phone keeps
 * its wheel because `(pointer: coarse)` never becomes `fine`, not because we guessed at a user
 * agent string. Both branches wear the identical trigger classes, so the closed control is the
 * same control either way.
 */
function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(pointer: fine)");
    const sync = (): void => setFine(query.matches);
    sync();
    // A laptop with a touchscreen, or a tablet that gains a trackpad mid-contest, changes this
    // without a reload.
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return fine;
}

/* ------------------------------------------------------------------------------------------ *
 * Select: the children API every existing caller uses
 * ------------------------------------------------------------------------------------------ */

export interface SelectProps
  extends Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    /* Ours means the trigger's metrics; the native one turns a select into a scrolling listbox. */
    "size" | "className" | "multiple"
  > {
  /** Trigger metrics. `sm` for toolbar chrome, `md` for a form row. */
  size?: SelectSize;
  /** Paints the accent rule. The CALLER owns the message; this only paints the box. */
  invalid?: boolean;
  /**
   * Sizing for the shell, not the control: `w-full`, `w-52 max-w-full`, and so on. The
   * control always fills the shell, because the chevron is positioned against the shell and
   * a control narrower than its shell would leave the glyph floating beside it.
   */
  shellClassName?: string;
  /** React 19 passes `ref` as an ordinary prop, but it still has to be declared. */
  ref?: Ref<HTMLSelectElement>;
  children: ReactNode;
}

export function Select({
  size = "md",
  invalid = false,
  shellClassName = "w-full",
  style,
  children,
  id,
  disabled = false,
  required = false,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  ref,
  ...rest
}: SelectProps) {
  const fine = useFinePointer();
  const options = useMemo(() => optionsFromChildren(children), [children]);

  const selectRef = useRef<HTMLSelectElement | null>(null);
  const attachRef = (node: HTMLSelectElement | null): void => {
    selectRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref !== null && ref !== undefined) ref.current = node;
  };

  /*
    Every caller in this repo is controlled, but an uncontrolled `<select>` is legal and its
    value lives only in the DOM, so the listbox would have nothing to paint as selected. Reading
    it back after mount is what keeps that case honest rather than quietly broken.
  */
  const controlled = rest.value !== undefined;
  const [fallbackValue, setFallbackValue] = useState<string>(
    rest.defaultValue === undefined ? "" : String(rest.defaultValue),
  );
  const optionKey = options.map((option) => option.value).join("\u0000");

  useEffect(() => {
    if (controlled) return;
    const node = selectRef.current;
    if (node !== null) setFallbackValue(node.value);
  }, [controlled, optionKey]);

  const currentValue = controlled ? String(rest.value) : fallbackValue;

  /**
   * Commit through the real element, so the caller's handler receives a real event.
   *
   * React tracks a controlled field's value on the node itself, so assigning `node.value`
   * directly is swallowed: the tracker sees no change and the dispatched event is dropped. The
   * prototype's setter is the way past that, and it is why this is four lines rather than one.
   */
  const commit = (next: string): void => {
    const node = selectRef.current;
    if (node !== null && node.value !== next) {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      if (setter !== undefined) setter.call(node, next);
      else node.value = next;
      node.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (!controlled) setFallbackValue(next);
  };

  if (!fine) {
    return (
      <span className={`relative inline-flex min-w-0 items-center ${shellClassName}`}>
        <select
          {...rest}
          ref={attachRef}
          id={id}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={invalid || undefined}
          /*
            `peer` so the chevron can follow the control's disabled state. It cannot inherit it:
            the glyph is a SIBLING, because a child of `<select>` may only be `<option>` or
            `<optgroup>` and anything else is dropped by the parser.
          */
          className={triggerClassName(
            size,
            invalid,
            "peer appearance-none cursor-pointer disabled:cursor-not-allowed",
          )}
          style={{ fontSize: CONTROL_FONT_SIZE[size], ...style }}
        >
          {children}
        </select>
        <Chevron size={size} open={false} />
      </span>
    );
  }

  return (
    <ListboxControl
      options={options}
      value={currentValue}
      onCommit={commit}
      size={size}
      invalid={invalid}
      disabled={disabled}
      required={required}
      id={id}
      ariaLabel={ariaLabel}
      ariaLabelledBy={ariaLabelledBy}
      ariaDescribedBy={ariaDescribedBy}
      shellClassName={shellClassName}
      style={style}
      mirror={
        /*
          `hidden` rather than `sr-only`: `display: none` is unambiguously out of the
          accessibility tree AND unfocusable, where a clipped-but-rendered control trips axe's
          `aria-hidden-focus` and can still be reached by a stray programmatic focus.
          Programmatic events still dispatch and bubble from it, which is all it is here for.

          `required` is deliberately NOT forwarded. A `display: none` control that fails
          constraint validation blocks its form with a message the browser cannot show and
          cannot focus, which reads to an organizer as a Submit button that does nothing. The
          requirement is carried as `aria-required` on the trigger, and every caller already
          validates in React and renders its own message.
        */
        <select
          {...rest}
          ref={attachRef}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
        >
          {children}
        </select>
      }
    />
  );
}

/* ------------------------------------------------------------------------------------------ *
 * Listbox: the options-array API, for call sites that are not already written against `<option>`
 * ------------------------------------------------------------------------------------------ */

export interface ListboxProps<T extends string> {
  readonly options: readonly ListboxOption<T>[];
  readonly value: T;
  /** Hands back the narrowed value, so a caller needs no `safeParse` to get its own union back. */
  readonly onChange: (next: T) => void;
  readonly size?: SelectSize;
  readonly invalid?: boolean;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly shellClassName?: string;
  readonly id?: string;
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
  readonly "aria-describedby"?: string;
}

/**
 * The same control as `Select`, addressed by an array instead of by children.
 *
 * `components/admin/ProblemBuilder.tsx` draws a raw `<select>` with its own border and no shared
 * surface, which is the drift `ui/Select` exists to end; this is what it should adopt. Nothing
 * in here is a second implementation: both entry points render one `ListboxControl` and one
 * native `<select>`, and only the shape of the option list differs.
 */
export function Listbox<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  invalid = false,
  disabled = false,
  required = false,
  shellClassName = "w-full",
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: ListboxProps<T>) {
  const fine = useFinePointer();

  if (!fine) {
    return (
      <span className={`relative inline-flex min-w-0 items-center ${shellClassName}`}>
        <select
          id={id}
          value={value}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            const hit = options.find((option) => option.value === event.target.value);
            if (hit !== undefined) onChange(hit.value);
          }}
          className={triggerClassName(
            size,
            invalid,
            "peer appearance-none cursor-pointer disabled:cursor-not-allowed",
          )}
          style={{ fontSize: CONTROL_FONT_SIZE[size] }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <Chevron size={size} open={false} />
      </span>
    );
  }

  return (
    <ListboxControl
      options={options}
      value={value}
      onCommit={(next) => {
        const hit = options.find((option) => option.value === next);
        if (hit !== undefined) onChange(hit.value);
      }}
      size={size}
      invalid={invalid}
      disabled={disabled}
      required={required}
      id={id}
      ariaLabel={ariaLabel}
      ariaLabelledBy={ariaLabelledBy}
      ariaDescribedBy={ariaDescribedBy}
      shellClassName={shellClassName}
    />
  );
}
