/**
 * Rendering a live template body into the text it inserts, with IntelliJ's fields.
 *
 * One renderer for both ways a template is reached (Tab after its abbreviation in engine.ts, and
 * accepting it from the completion popup in completion.ts), so the two can never disagree about
 * where the caret lands or where Tab goes next.
 *
 * Body syntax (see LiveTemplate in types.ts):
 *   $END$          where the caret ends up once every field is filled
 *   ${1}           an empty field, visited first
 *   ${2:int}       a field holding a default value, selected when the caret reaches it
 *   $EXPR$         the expression a postfix template was typed after (`n` in `n.fori`)
 *   a leading tab  one indent level on a continuation line
 */

import type { TabStop } from "./types";

export const END_MARKER = "$END$";
export const EXPR_MARKER = "$EXPR$";

/** `$END$`, `${n}` or `${n:default}`. Defaults cannot contain "}" or a newline. */
const MARKER = /\$END\$|\$\{(\d+)(?::([^}\n]*))?\}/g;

export interface RenderedTemplate {
  readonly text: string;
  /** The first field, or $END$ when there are no fields, as offsets into `text`. */
  readonly selectionStart: number;
  readonly selectionEnd: number;
  /** Where Tab goes after the first field, in order, ending at $END$. Empty with no fields. */
  readonly tabStops: readonly TabStop[];
  /** Copies of the first field, which leaving it keeps equal to it. */
  readonly mirrors: readonly TabStop[];
}

interface Field {
  readonly order: number;
  readonly from: number;
  readonly to: number;
}

/**
 * The body as typed on a line indented by `indent`: continuation lines take that indent, their
 * leading tabs widen to `unit`, $EXPR$ becomes `expression`, and the markers become the caret
 * and the tab stops. With no $END$, the end of the body is the end.
 */
export function renderTemplate(
  body: string,
  indent: string,
  unit: string,
  expression = "",
): RenderedTemplate {
  const indented = body
    .split(EXPR_MARKER)
    .join(expression)
    .split("\n")
    .map((line, i) => {
      if (i === 0 || line === "") return line;
      return indent + line.replace(/^\t+/, (tabs) => unit.repeat(tabs.length));
    })
    .join("\n");

  let text = "";
  let last = 0;
  let end: number | null = null;
  const fields: Field[] = [];
  for (const match of indented.matchAll(MARKER)) {
    const at = match.index;
    text += indented.slice(last, at);
    last = at + match[0].length;
    if (match[0] === END_MARKER) {
      end ??= text.length;
      continue;
    }
    const fallback = match[2] ?? "";
    fields.push({ order: Number(match[1]), from: text.length, to: text.length + fallback.length });
    text += fallback;
  }
  text += indented.slice(last);

  const finish: TabStop = { from: end ?? text.length, to: end ?? text.length };
  const ordered = [...fields].sort((a, b) => a.order - b.order || a.from - b.from);
  // A number written twice is one field: the first copy is visited, the others mirror it.
  const stops: TabStop[] = [];
  let lastOrder: number | null = null;
  for (const field of ordered) {
    const previous = stops[stops.length - 1];
    if (field.order === lastOrder && previous !== undefined) {
      stops[stops.length - 1] = { ...previous, mirrors: [...(previous.mirrors ?? []), { from: field.from, to: field.to }] };
    } else {
      stops.push({ from: field.from, to: field.to });
    }
    lastOrder = field.order;
  }
  const first = stops[0];
  if (first === undefined) {
    return { text, selectionStart: finish.from, selectionEnd: finish.to, tabStops: [], mirrors: [] };
  }
  return {
    text,
    selectionStart: first.from,
    selectionEnd: first.to,
    tabStops: [...stops.slice(1), finish],
    mirrors: first.mirrors ?? [],
  };
}

/** Shifts tab stops by `offset`, turning offsets into the insert into offsets into the text. */
export function shiftStops(stops: readonly TabStop[], offset: number): readonly TabStop[] {
  return stops.map((stop) =>
    stop.mirrors === undefined
      ? { from: stop.from + offset, to: stop.to + offset }
      : { from: stop.from + offset, to: stop.to + offset, mirrors: shiftStops(stop.mirrors, offset) },
  );
}

/** The template parts of an Edit: its later stops and the first field's mirrors, if any. */
export function templateParts(
  rendered: RenderedTemplate,
  offset: number,
): { readonly tabStops?: readonly TabStop[]; readonly mirrors?: readonly TabStop[] } {
  if (rendered.tabStops.length === 0) return {};
  const tabStops = shiftStops(rendered.tabStops, offset);
  return rendered.mirrors.length === 0 ? { tabStops } : { tabStops, mirrors: shiftStops(rendered.mirrors, offset) };
}
