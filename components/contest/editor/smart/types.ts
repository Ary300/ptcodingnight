/**
 * The contract for the editor's IntelliJ-style behaviour, shared by every module in this folder.
 *
 * The editor stays a <textarea> (drafts, tests, accessibility and the highlight overlay all depend
 * on it). Everything smart is a PURE function over an EditState, so each behaviour is a unit test
 * rather than a browser test, and the surface only has to apply the result in a way that keeps
 * native undo (document.execCommand("insertText") over the replaced range).
 *
 * Familiarity is the goal: students use IntelliJ for Java, and the same habits (pairs closing
 * themselves, "}" snapping to its block, sout + Tab, Cmd/Ctrl + / to comment) should just work
 * here, with the Python and C++ equivalents from PyCharm and CLion.
 */

export type EditorLanguage = "java" | "python" | "cpp";

/** The text and selection the editor holds. Offsets are UTF-16 indices, as a textarea's are. */
export interface EditState {
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/**
 * An edit as a single replacement, so the surface can apply it with one insertText call and the
 * browser's own undo stack records it as one step. `from`/`to` index the OLD text.
 */
export interface Edit {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
  /** Selection AFTER the edit, as offsets into the NEW text. */
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/** The key as the surface saw it. `isMac` decides whether Cmd or Ctrl is the IntelliJ modifier. */
export interface KeyInput {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly isMac: boolean;
}

/** An IntelliJ live template. `body` marks the caret with $END$ and may span lines. */
export interface LiveTemplate {
  readonly abbreviation: string;
  readonly description: string;
  readonly body: string;
}

export type CompletionKind =
  | "keyword"
  | "type"
  | "method"
  | "field"
  | "function"
  | "variable"
  | "snippet";

export interface CompletionItem {
  /** What the popup shows, e.g. "println(String x)". */
  readonly label: string;
  /** What replaces the typed prefix, e.g. "println()". */
  readonly insertText: string;
  readonly kind: CompletionKind;
  /** Short right-aligned hint, e.g. "void" or "java.util". */
  readonly detail?: string;
  /** Caret position inside insertText after accepting; defaults to its end. */
  readonly caretOffset?: number;
}

export interface LanguageProfile {
  readonly id: EditorLanguage;
  /** "//" or "#". */
  readonly lineComment: string;
  /** One indent level. Four spaces in all three, as IntelliJ, PyCharm and CLion default to. */
  readonly indentUnit: string;
  /** Bracket pairs that close themselves, e.g. ["(", ")"]. */
  readonly pairs: readonly (readonly [open: string, close: string])[];
  /** Quote characters that close themselves (not inside a word, not when escaping). */
  readonly quotes: readonly string[];
  /** Whether the line before the caret opens a block, so Enter indents one level more. */
  readonly opensBlock: (lineBeforeCaret: string) => boolean;
  /** Characters that, typed as the first non-space on a line, snap that line to its block's indent. */
  readonly dedentOnType: readonly string[];
  readonly templates: readonly LiveTemplate[];
  readonly keywords: readonly string[];
  /** Top-level suggestions: classes, builtins, std:: names, common functions. */
  readonly globals: readonly CompletionItem[];
  /**
   * Suggestions after a dot (or "::"), keyed by the qualifier text: "System", "System.out",
   * "Math", "Arrays", "std" ... The key "*" holds members offered after ANY other qualifier
   * (length(), charAt(), size(), get(), add() ...), since the editor does not infer types.
   */
  readonly members: Readonly<Record<string, readonly CompletionItem[]>>;
}

/** Where completion applies: the identifier being typed and what qualifies it, if anything. */
export interface CompletionContext {
  readonly prefix: string;
  readonly replaceFrom: number;
  readonly replaceTo: number;
  /** "System.out" for `System.out.pri|`, "std" for `std::so|`, null at top level. */
  readonly qualifier: string | null;
}

/*
  Module layout (each a pure module with a colocated test in tests/unit/editor-*.test.ts):

    engine.ts       handleKey(state, input, profile): Edit | null   (null: let the browser act)
                    Covers: pair insert, skip over a typed closer, Backspace deleting an empty
                    pair, Enter with indent (and the IntelliJ split of "{|}" onto three lines),
                    dedent-on-type, Mod+/ toggle line comment, Mod+D duplicate line, Alt+Shift+Up/
                    Down move line, Tab expanding a live template whose abbreviation ends at the
                    caret. Tab otherwise returns null so the surface keeps its own block indent.
    completion.ts   completionContext(text, caret): CompletionContext | null
                    completionsFor(ctx, text, profile, limit = 12): CompletionItem[]
                    applyCompletion(state, ctx, item): Edit
                    Ranks prefix matches first, then camel-hump matches (IntelliJ's "sout" ->
                    "System.out"? no: hump means "pI" -> "parseInt"), identifiers declared in
                    the file, keywords, globals, templates as snippets. Case-insensitive prefix.
    java.ts         export const JAVA: LanguageProfile
    python.ts       export const PYTHON: LanguageProfile
    cpp.ts          export const CPP: LanguageProfile
    index.ts        profileFor(languageId: LanguageId): LanguageProfile | null (integration)
*/
