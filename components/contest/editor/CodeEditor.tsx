"use client";

import dynamic from "next/dynamic";

import type { CodeEditorProps } from "./types";

/**
 * The editor, lazy-loaded (PRD §10: "Editor — Monaco, lazy-loaded").
 *
 * The join screen, the lobby, and the submissions history must not pay for an editor they
 * never show, and on a school laptop over a saturated LAN that is the difference between
 * the contest opening on time and not. `ssr: false` because an editing surface has no
 * meaningful server render and hydrating one costs more than it saves.
 *
 * ## The Monaco seam
 *
 * When `@monaco-editor/react` is added to `package.json`, this file is the only one that
 * changes:
 *
 * ```ts
 * const Surface = dynamic(() => import("./MonacoSurface").then((m) => m.MonacoSurface), {
 *   ssr: false,
 *   loading: () => <EditorSkeleton />,
 * });
 * ```
 *
 * `CodeEditorProps` is the contract both surfaces implement, so no call site moves. Monaco
 * must be self-hosted rather than loaded from jsDelivr — `@monaco-editor/react` defaults to
 * a CDN, and the night has no internet.
 */

function EditorSkeleton() {
  return (
    <div
      className="flex min-h-[18rem] items-center justify-center rounded border border-ink/20 bg-ink text-paper/60"
      style={{ fontSize: "var(--text-xs)" }}
      role="status"
    >
      Loading editor…
    </div>
  );
}

const Surface = dynamic(() => import("./CodeEditorSurface").then((m) => m.CodeEditorSurface), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

export function CodeEditor(props: CodeEditorProps) {
  return <Surface {...props} />;
}

export { LANGUAGE_LABEL, LANGUAGE_TEMPLATE, type CodeEditorProps } from "./types";
