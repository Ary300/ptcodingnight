"use client";

import dynamic from "next/dynamic";

import type { CodeEditorSurfaceProps } from "./CodeEditorSurface";

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

/**
 * Reserves the same band the surface will occupy — `min-h-[22rem]`, `--ink` ground, no border of
 * its own — so the panel around it does not jump when the chunk lands. A skeleton with different
 * metrics moves the Submit button under the student's cursor at the moment they reach for it.
 */
function EditorSkeleton() {
  return (
    <div
      className="flex min-h-[16rem] items-center justify-center bg-ink text-paper/60 sm:min-h-[22rem]"
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

export function CodeEditor(props: CodeEditorSurfaceProps) {
  return <Surface {...props} />;
}

export { LANGUAGE_LABEL, LANGUAGE_TEMPLATE, type CodeEditorProps } from "./types";
