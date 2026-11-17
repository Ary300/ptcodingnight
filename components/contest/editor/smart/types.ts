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
  /**
   * Which end of the selection moves, as the textarea's `selectionDirection` reports it. Shift+Home
   * and Shift+End extend from the anchor, which is selectionEnd when this is "backward". Absent
   * means "forward".
   */
  readonly selectionDirection?: SelectionDirection;
}

/** A textarea's selection direction: "backward" puts the moving end at selectionStart. */
export type SelectionDirection = "forward" | "backward" | "none";

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
  /**
   * The fields of a live template still to visit, in order, as ranges in the NEW text. Tab or
   * Enter moves to the next one, as IntelliJ's template fields do; a non-empty range is a default
   * value, selected so typing replaces it. Absent for every edit that is not a template.
   */
  readonly tabStops?: readonly TabStop[];
  /**
   * Copies of the FIRST field (the one selected after the edit) elsewhere in the template, as
   * ranges in the NEW text: the `i` of `for (int i = 0; i < n; i++)` written three times. Leaving
   * the field writes what was typed into each copy, as IntelliJ's linked template variables do.
   */
  readonly mirrors?: readonly TabStop[];
  /**
   * The direction to give the selection after the edit, for Shift+Home extending leftwards from
   * its anchor. Absent means "forward"; the surface passes it to setSelectionRange.
   */
  readonly selectionDirection?: SelectionDirection;
}

/** A place a live template's Tab moves to: `from === to` for an empty field or the $END$ line. */
export interface TabStop {
  readonly from: number;
  readonly to: number;
  /** Copies of this field later in the template, kept equal to it (see `Edit.mirrors`). */
  readonly mirrors?: readonly TabStop[];
}

/** The key as the surface saw it. `isMac` decides whether Cmd or Ctrl is the IntelliJ modifier. */
export interface KeyInput {
  readonly key: string;
  /**
   * The physical key (`event.code`, "Slash", "KeyJ"). On a Mac, Option turns `key` into a symbol
   * (Option+/ is "\u00f7"), so Alt and Option chords match on this. Optional so older callers
   * still type-check; the engine falls back to `key` without it.
   */
  readonly code?: string;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly isMac: boolean;
}

/**
 * An IntelliJ live template. `body` marks the caret with $END$ and may span lines; a leading tab
 * on a continuation line is one indent level.
 *
 * Fields are written `${1}` or `${1:default}` and visited in number order before $END$: the caret
 * starts in the first, and Tab or Enter moves on, so `fori` puts the caret at the loop bound and
 * the next Tab lands on the indented line inside the braces. A postfix template (typed after a
 * dot, as in `n.fori`) names the expression before the dot with $EXPR$.
 */
export interface LiveTemplate {
  readonly abbreviation: string;
  readonly description: string;
  readonly body: string;
  /**
   * Where Tab may expand the template, as IntelliJ's template contexts: "statement" as the first
   * thing on its line, "toplevel" outside every block, "classbody" directly inside a class, and
   * "declaration" also mid-line after a space, "(", "<" or ",". Absent: inferred from the body
   * (see template-context.ts).
   */
  readonly context?: TemplateContext;
  /**
   * The body to use when a macro the main body needs finds nothing in the file (`itar` with no
   * array declared), see template-macros.ts.
   */
  readonly fallback?: string;
}

export type TemplateContext = "statement" | "toplevel" | "classbody" | "declaration";

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
  /**
   * Ranks this item above others that match equally well, for the names contest code reaches for
   * most (push_back over push, first over find). Higher first; absent is 0. The editor does not
   * infer types, so this is how `v.pb` means push_back, as CLion would know from the vector.
   */
  readonly priority?: number;
  /** Caret position inside insertText after accepting; defaults to its end. */
  readonly caretOffset?: number;
  /**
   * The import line this name needs, written in full: "import java.io.BufferedReader;",
   * "#include <vector>", "from collections import deque", "import math". Accepting the item adds
   * it unless the file already has it or a wildcard that covers it (completion/imports.ts). The
   * Edit stays ONE replacement spanning the import and the word, so it is one undo step.
   */
  readonly importLine?: string;
  /** Quick Documentation: the signature, then one plain sentence. */
  readonly doc?: string;
  /** Java: a generic class, so `new` completes it with the diamond, `ArrayList<>()`. */
  readonly generic?: boolean;
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
  /**
   * Python's continuation clauses: typing the ":" of `else:` snaps the line to the indent of the
   * nearest enclosing line that starts with one of the listed openers, as PyCharm does. Keyed by
   * the clause's first word ("else", "elif", "except", "finally").
   */
  readonly alignOnColon?: Readonly<Record<string, readonly string[]>>;
  /** Whether the line ends its block (`return`, `pass`, `break` ...), so Enter drops one level. */
  readonly closesBlock?: (lineBeforeCaret: string) => boolean;
  readonly templates: readonly LiveTemplate[];
  /** IntelliJ's postfix templates (`x.sout`, `n.fori`), whose bodies name the expression $EXPR$. */
  readonly postfixTemplates?: readonly LiveTemplate[];
  readonly keywords: readonly string[];
  /** Top-level suggestions: classes, builtins, std:: names, common functions. */
  readonly globals: readonly CompletionItem[];
  /**
   * Suggestions after a dot (or "::"), keyed by the qualifier text: "System", "System.out",
   * "Math", "Arrays", "std" ... The key "*" holds members offered after ANY other qualifier
   * (length(), charAt(), size(), get(), add() ...), since the editor does not infer types.
   */
  readonly members: Readonly<Record<string, readonly CompletionItem[]>>;
  /**
   * Names that are offered at the top level but need an import first (Python's deque, heappush,
   * sqrt). Each carries its `importLine`. Globals may carry one too (Java's ArrayList).
   */
  readonly importables?: readonly CompletionItem[];
  /**
   * What accepting a keyword appends, as IntelliJ does: " " after return or new, " ()" after if.
   * A "|" in the tail marks the caret ("(|)"); otherwise the caret goes after it.
   */
  readonly keywordTails?: Readonly<Record<string, string>>;
  /**
   * Instance members by the receiver's lexically inferred type, keyed by the type's simple name
   * ("String", "List", "vector", "str"). completion/infer.ts finds the type from the variable's
   * declaration or its assignment; nothing here is a type checker.
   */
  readonly typeMembers?: Readonly<Record<string, readonly CompletionItem[]>>;
  /** Names the import statement offers: Python modules and their members, Java packages. */
  readonly importTargets?: Readonly<Record<string, readonly CompletionItem[]>>;
}

/** Where completion applies: the identifier being typed and what qualifies it, if anything. */
export interface CompletionContext {
  readonly prefix: string;
  readonly replaceFrom: number;
  readonly replaceTo: number;
  /** "System.out" for `System.out.pri|`, "std" for `std::so|`, null at top level. */
  readonly qualifier: string | null;
  /**
   * Set inside an import statement ("import he|", "from collections import de|", "import
   * java.util.Arr|"), where the qualifier names a module or package, and after "#include <",
   * where the prefix is a header path. Absent everywhere else.
   */
  readonly scope?: "import" | "include";
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
                    A name typed in full ranks first, so accepting it is a no-op.
    members.ts      fileMembers(text, braces, ...): the file's own fields and methods, offered
                    after a dot ahead of the general "*" members.
    template.ts     renderTemplate(body, indent, unit, expression?): the text, caret and tab
                    stops of a live or postfix template.
    template-session.ts  startTemplateSession / nextTemplateStop: Tab and Enter walking the
                    fields of an expanded template, as IntelliJ's do.
    java.ts         export const JAVA: LanguageProfile
    python.ts       export const PYTHON: LanguageProfile
    cpp.ts          export const CPP, C: LanguageProfile
    index.ts        profileFor(languageId: LanguageId): LanguageProfile | null (integration)
*/
