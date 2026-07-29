import type { ReactNode } from "react";

/**
 * A deliberately small TeX fallback.
 *
 * KaTeX is what this should be, and PRD §9.1 asks for it. `katex` is not installed and
 * `package.json` is orchestrator-owned, so this scope cannot add it — the request is filed
 * in the report. **This is the seam**: when `katex` lands, replace the body of `<Tex>` with
 * a KaTeX render and delete `renderTex`. Nothing else in the tree needs to change, because
 * every call site already passes raw TeX and nothing else.
 *
 * Two rules the fallback follows so it degrades honestly rather than prettily:
 *
 *  1. **Every substitution stays inside Latin-1.** docs/DESIGN.md §3 is explicit that
 *     glyphs outside the vendored woff2 subsets silently fall back to whatever font the
 *     machine has. `\le` therefore becomes `<=`, not `≤` (U+2264, outside the subset).
 *     `×` and `·` are U+00D7 and U+00B7 and are safe.
 *  2. **The original TeX is preserved as the accessible name.** A screen reader gets the
 *     source, not this approximation.
 */

/** Longest-first at lookup time, so `\leq` is never matched as `\le` + `q`. */
const COMMANDS: Readonly<Record<string, string>> = {
  "\\le": "<=",
  "\\leq": "<=",
  "\\ge": ">=",
  "\\geq": ">=",
  "\\ne": "!=",
  "\\neq": "!=",
  "\\lt": "<",
  "\\gt": ">",
  "\\times": "×",
  "\\cdot": "·",
  "\\pm": "±",
  "\\div": "÷",
  "\\ldots": "...",
  "\\cdots": "...",
  "\\dots": "...",
  "\\in": " in ",
  "\\bmod": " mod ",
  "\\bigl": "",
  "\\bigr": "",
  "\\left": "",
  "\\right": "",
  "\\lfloor": "floor(",
  "\\rfloor": ")",
  "\\lceil": "ceil(",
  "\\rceil": ")",
  "\\{": "{",
  "\\}": "}",
  "\\%": "%",
  "\\$": "$",
  "\\_": "_",
  "\\&": "&",
  "\\#": "#",
  "\\,": " ",
  "\\;": " ",
  "\\:": " ",
  "\\!": "",
  "\\ ": " ",
  "\\quad": "  ",
  "\\qquad": "    ",
};

const COMMAND_NAMES = Object.keys(COMMANDS).sort((a, b) => b.length - a.length);

/** Read the argument of `^`/`_` — either `{...}` or a single character. */
function readGroup(source: string, start: number): { body: string; next: number } {
  if (source[start] === "{") {
    let depth = 1;
    let index = start + 1;
    while (index < source.length && depth > 0) {
      const char = source[index];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      if (depth > 0) index += 1;
    }
    return { body: source.slice(start + 1, index), next: index + 1 };
  }
  return { body: source[start] ?? "", next: start + 1 };
}

export function renderTex(tex: string, keyPrefix = "t"): ReactNode[] {
  const out: ReactNode[] = [];
  let buffer = "";
  let index = 0;
  let key = 0;

  const flush = () => {
    if (buffer.length > 0) {
      out.push(buffer);
      buffer = "";
    }
  };

  while (index < tex.length) {
    const char = tex[index] ?? "";

    if (char === "^" || char === "_") {
      const { body, next } = readGroup(tex, index + 1);
      flush();
      key += 1;
      out.push(
        char === "^" ? (
          <sup key={`${keyPrefix}-${key}`}>{renderTex(body, `${keyPrefix}-${key}`)}</sup>
        ) : (
          <sub key={`${keyPrefix}-${key}`}>{renderTex(body, `${keyPrefix}-${key}`)}</sub>
        ),
      );
      index = next;
      continue;
    }

    if (char === "\\") {
      const name = COMMAND_NAMES.find((candidate) => tex.startsWith(candidate, index));
      if (name !== undefined) {
        buffer += COMMANDS[name] ?? "";
        index += name.length;
        continue;
      }
      // Unknown command: drop the backslash, keep the letters. `\alpha` reads as `alpha`,
      // which is wrong but legible — and the aria-label still carries the real source.
      index += 1;
      continue;
    }

    // Grouping braces carry no meaning once the group has been consumed.
    if (char === "{" || char === "}") {
      index += 1;
      continue;
    }

    buffer += char;
    index += 1;
  }

  flush();
  return out;
}

export interface TexProps {
  tex: string;
  display?: boolean;
}

export function Tex({ tex, display = false }: TexProps) {
  const content = renderTex(tex);

  if (display) {
    return (
      <div
        className="numeric my-4 overflow-x-auto text-center"
        role="math"
        aria-label={tex}
        style={{ fontSize: "var(--text-md)" }}
      >
        {content}
      </div>
    );
  }

  return (
    <span className="numeric" role="math" aria-label={tex} style={{ whiteSpace: "nowrap" }}>
      {content}
    </span>
  );
}
