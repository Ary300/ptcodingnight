/**
 * A live template still being filled in, and where Tab or Enter goes next.
 *
 * IntelliJ keeps a template "active" after it expands: the caret sits in the first field, Tab
 * moves to the next, and the last Tab lands on $END$ (the indented line inside a loop's braces).
 * The editor only ever edits inside the CURRENT field while a template is active, so a stop
 * before the field never moves and a stop after it moves by exactly the change in the text's
 * length. That is all the bookkeeping this needs, and it keeps the session a plain value.
 *
 * The session ends on its own the moment the caret is found outside the current field: a click
 * elsewhere, an arrow off the line, or a field typed past its own end.
 */

import type { Edit, EditState, TabStop } from "./types";

export interface TemplateSession {
  /** Length of the text when the session last moved, to measure the field's growth against. */
  readonly textLength: number;
  /** The field the caret is in, as it was when the session last moved. */
  readonly field: TabStop;
  /** The stops still to visit, in order. Never empty: an exhausted session is null. */
  readonly stops: readonly TabStop[];
}

/** The session an applied edit starts, or null when the edit was not a template with fields. */
export function startTemplateSession(textAfter: string, edit: Edit): TemplateSession | null {
  const stops = edit.tabStops ?? [];
  if (stops.length === 0) return null;
  return {
    textLength: textAfter.length,
    field: { from: edit.selectionStart, to: edit.selectionEnd },
    stops,
  };
}

/**
 * The move to the next stop, and the session after it (null once $END$ is reached). Null when
 * the caret has left the current field, which means the session is over and the key is not ours.
 */
export function nextTemplateStop(
  session: TemplateSession,
  state: EditState,
): { readonly edit: Edit; readonly session: TemplateSession | null } | null {
  const delta = state.text.length - session.textLength;
  const fieldEnd = session.field.to + delta;
  const start = Math.min(state.selectionStart, state.selectionEnd);
  const end = Math.max(state.selectionStart, state.selectionEnd);
  if (fieldEnd < session.field.from || start < session.field.from || end > fieldEnd) return null;

  const moved = session.stops.map((stop) =>
    stop.from >= session.field.to ? { from: stop.from + delta, to: stop.to + delta } : stop,
  );
  const [next, ...rest] = moved;
  if (next === undefined || next.to > state.text.length) return null;

  const edit: Edit = { from: start, to: start, insert: "", selectionStart: next.from, selectionEnd: next.to };
  const after = rest.length === 0 ? null : { textLength: state.text.length, field: next, stops: rest };
  return { edit, session: after };
}
