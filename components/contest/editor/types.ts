import type { Language } from "@/lib/schemas/judge";

/**
 * The editor's public surface — the one thing that must not change when the engine behind
 * it does. See `CodeEditor.tsx` for the Monaco seam.
 */
export interface CodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  language: Language;
  disabled?: boolean;
  /** Ctrl/Cmd+Enter. Judged submit is a deliberate action, so this confirms nothing. */
  onSubmitShortcut?: () => void;
  /** Accessible name for the editing surface. */
  label: string;
}

export const LANGUAGE_LABEL: Readonly<Record<Language, string>> = {
  PYTHON: "Python 3",
  JAVA: "Java",
};

/** Starter files, so the first thing a student sees is not an empty box. */
export const LANGUAGE_TEMPLATE: Readonly<Record<Language, string>> = {
  PYTHON: ["import sys", "", "def main():", "    data = sys.stdin.read().split()", "    # your code here", "", "main()", ""].join("\n"),
  JAVA: [
    "import java.util.*;",
    "import java.io.*;",
    "",
    "public class Main {",
    "    public static void main(String[] args) throws IOException {",
    "        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));",
    "        // your code here",
    "    }",
    "}",
    "",
  ].join("\n"),
};
