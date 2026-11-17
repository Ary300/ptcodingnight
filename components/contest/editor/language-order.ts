import { LANGUAGE_IDS } from "@/lib/judge/runtimes";
import type { Language } from "@/lib/schemas/judge";

/**
 * The three languages the night is written in, in the order the organizers asked for on
 * 2026-11-16: Java 21 first because about nine in ten students write it, then Python 3, then C++17.
 */
export const LEADING_LANGUAGES: readonly Language[] = ["JAVA_21", "PYTHON_312", "CPP_17"];

/**
 * The editor's language tabs, left to right.
 *
 * Only languages the problem allows, and every one of them. The leading three come first when
 * offered, then the rest in registry order (`LANGUAGE_IDS`). The server's own order is not used,
 * because a problem authored as `["PYTHON_312", "JAVA_21", "CPP_17"]` would otherwise put Python
 * first on one problem and Java first on the next, and a tab that moves gets misclicked.
 */
export function orderLanguages(allowed: readonly Language[]): Language[] {
  const offered = new Set(allowed);
  const leading = LEADING_LANGUAGES.filter((language) => offered.has(language));
  const rest = LANGUAGE_IDS.filter(
    (language) => offered.has(language) && !LEADING_LANGUAGES.includes(language),
  );
  return [...leading, ...rest];
}
