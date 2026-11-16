import type { Language } from "@/lib/schemas/judge";

/**
 * One sentence of help above the compiler output, for the two Java mistakes an IDE hands a student.
 *
 * Measured on 2026-11-16 by submitting what an IDE produces:
 *
 *  - `public class Solution` (or any name but Main) is CE, and javac says "class Solution is public,
 *    should be declared in a file named Solution.java". Accurate, and it does not say "Main".
 *  - a `package com.example;` line is CE with the bare text "Compilation failed" and nothing else,
 *    for code that compiles in the student's own editor.
 *
 * Nine in ten students write Java on the night, so both are worth a sentence. Anything else gets no
 * hint: the compiler's own words are better than a guess.
 */

const JAVA: readonly Language[] = ["JAVA_8", "JAVA_11", "JAVA_17", "JAVA_21"];

const WRONG_CLASS_NAME = /class (\w+) is public, should be declared in a file named \1\.java/;
const PACKAGE_LINE = /^\s*package\s+[\w.]+\s*;/m;

export function compileHint(
  language: Language | null | undefined,
  compileError: string | null,
  source: string | null | undefined,
): string | null {
  if (compileError === null || language == null || !JAVA.includes(language)) return null;

  if (source != null && PACKAGE_LINE.test(source)) {
    return "Delete the package line at the top of your code. The judge compiles your file on its own, outside any package.";
  }
  const named = WRONG_CLASS_NAME.exec(compileError);
  if (named !== null) {
    return `Rename the class ${named[1] ?? ""} to Main. The judge saves your code as Main.java, so the public class must be called Main.`;
  }
  return null;
}
