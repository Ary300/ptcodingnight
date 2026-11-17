import type { Edit, EditState, LanguageProfile } from "./types";

/**
 * Re-indent on paste, and clean what a PDF or a chat app put on the clipboard.
 *
 * A multi-line paste loses its common leading indent and every line after the first is re-based
 * to the caret line's indent; the first line keeps what is before the caret. Non-breaking spaces
 * become spaces and Windows line ends become "\n". In Python a leading tab becomes one indent
 * unit, because tabs mixed with spaces are a TabError there.
 *
 * Minimal version written by the commands group against the agreed name `reindentPaste`; the
 * engine group's version replaces it. Null means "let the browser paste it as it is".
 */

function leadingWidth(line: string): number {
  return /^[ \t]*/.exec(line)?.[0].length ?? 0;
}

export function reindentPaste(state: EditState, clipboard: string, profile: LanguageProfile): Edit | null {
  let text = clipboard.replace(/\r\n?/g, "\n").replace(/ /g, " ");
  if (profile.id === "python") {
    text = text.replace(/^\t+/gm, (tabs) => profile.indentUnit.repeat(tabs.length));
  }
  const lines = text.split("\n");
  const { selectionStart: from, selectionEnd: to } = state;

  if (lines.length > 1) {
    const lineStart = state.text.lastIndexOf("\n", from - 1) + 1;
    const indent = /^[ \t]*/.exec(state.text.slice(lineStart, from))?.[0] ?? "";
    const first = (lines[0] ?? "").replace(/^[ \t]+/, "");
    const rest = lines.slice(1);
    // Where the first line sat in its source, read off the next non-blank line: one level less
    // when the first line opens a block, the same level otherwise. The copy usually starts after
    // the first line's own indent, so that indent is not on the clipboard to measure.
    const next = rest.find((line) => line.trim() !== "");
    const original =
      next === undefined ? 0 : Math.max(0, leadingWidth(next) - (profile.opensBlock(first) ? profile.indentUnit.length : 0));
    const shift = indent.length - original;
    const rebased = rest.map((line) => {
      if (line.trim() === "") return "";
      const width = Math.max(0, leadingWidth(line) + shift);
      return " ".repeat(width) + line.slice(leadingWidth(line));
    });
    const keepsLead = from !== lineStart + indent.length;
    text = [keepsLead ? (lines[0] ?? "") : first, ...rebased].join("\n");
  }

  if (text === clipboard) return null;
  const caret = from + text.length;
  return { from, to, insert: text, selectionStart: caret, selectionEnd: caret };
}
