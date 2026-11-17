/**
 * Which smart profile a judge language gets, and the one import the editor surface needs.
 *
 * Every Java variant is IntelliJ, Python is PyCharm, and C and C++ are CLion: C shares C++'s
 * braces, comments and Enter, with its own names (`printf`, `scanf`, no `std::`, no C++ keywords)
 * so `pri` never offers `private`. JavaScript and Go have no profile yet, so the surface
 * keeps its plain behaviour for them (Tab indents, Enter keeps the indent).
 */

import type { LanguageId } from "@/lib/judge/runtimes";

import { C, CPP } from "./cpp";
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
  C_17: C,
  JAVASCRIPT_NODE22: null,
  GO_123: null,
};

export function profileFor(languageId: LanguageId): LanguageProfile | null {
  return PROFILE[languageId] ?? null;
}

export {
  applyCompletion,
  autoPopupSuppressed,
  completionContext,
  completionsFor,
  insertsSingleSuggestion,
} from "./completion";
export { docFor, quickDocAt, signatureAt, signaturesFor, type SignatureHelp } from "./docs";
export { handleKey } from "./engine";
export {
  expandWord,
  expandWordAnchor,
  expandWordCandidates,
  type ExpandWordAnchor,
} from "./expand-word";
export { importFixFor, type ContextAction } from "./imports";
export type {
  CompletionContext,
  CompletionItem,
  CompletionKind,
  Edit,
  EditState,
  KeyInput,
  LanguageProfile,
} from "./types";
