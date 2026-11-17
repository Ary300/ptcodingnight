/**
 * Which smart profile a judge language gets, and the one import the editor surface needs.
 *
 * Every Java variant is IntelliJ, Python is PyCharm, and C and C++ share CLion's profile: C has
 * no `std::` and no classes, but its braces, comments, `main` and `printf` behave the same, and a
 * suggestion it does not need costs nothing. JavaScript and Go have no profile yet, so the surface
 * keeps its plain behaviour for them (Tab indents, Enter keeps the indent).
 */

import type { LanguageId } from "@/lib/judge/runtimes";

import { CPP } from "./cpp";
import { JAVA } from "./java";
import { PYTHON } from "./python";
import type { LanguageProfile } from "./types";

/**
 * A `Record` over every id rather than a switch with a default, so adding a language to the
 * registry is a type error here until somebody decides which profile it gets.
 */
const PROFILE: Readonly<Record<LanguageId, LanguageProfile | null>> = {
  PYTHON_312: PYTHON,
  JAVA_8: JAVA,
  JAVA_11: JAVA,
  JAVA_17: JAVA,
  JAVA_21: JAVA,
  CPP_11: CPP,
  CPP_17: CPP,
  C_17: CPP,
  JAVASCRIPT_NODE22: null,
  GO_123: null,
};

export function profileFor(languageId: LanguageId): LanguageProfile | null {
  return PROFILE[languageId] ?? null;
}

export { applyCompletion, completionContext, completionsFor } from "./completion";
export { handleKey } from "./engine";
export type {
  CompletionContext,
  CompletionItem,
  CompletionKind,
  Edit,
  EditState,
  KeyInput,
  LanguageProfile,
} from "./types";
