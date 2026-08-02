"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui";
import type { Language } from "@/lib/schemas/judge";

import { LANGUAGE_LABEL } from "./types";

/**
 * "Upload Code as File" — the control HackerRank puts under its editor, bottom left.
 *
 * ## Why a student wants it
 *
 * They wrote the solution in their own editor, because that is where their fingers are and where
 * their compiler is. Retyping it into a browser textarea at 8pm is how a working solution acquires
 * a typo. Pasting works, and on a school laptop with a trackpad and an unfamiliar keyboard layout
 * it works less often than you would think.
 *
 * ## The two things this refuses
 *
 * **Size.** The submit route caps source at 200 000 characters, so a file above that is rejected
 * HERE, with its actual size named, rather than after an upload that appears to succeed and then
 * fails validation at the far end.
 *
 * **Nothing else.** It does not check the extension against the selected language, because that
 * check is wrong more often than it is right: a student writing C++ in a `.txt` scratch file is
 * doing nothing incorrect, and a student who uploads `main.py` while Java is selected has made a
 * mistake the compiler will describe far better than a filename ever could. The file's CONTENT is
 * what gets judged, and the language dropdown is what decides how — so the extension is advice,
 * and it is offered as a warning rather than enforced as a rule.
 */

/** The submit route's cap, restated so the failure happens before the network rather than after. */
const MAX_SOURCE_CHARS = 200_000;

/** Extensions we recognise, only to warn when one disagrees with the chosen language. */
const EXPECTED_EXTENSION: Readonly<Partial<Record<Language, readonly string[]>>> = {
  PYTHON_312: [".py"],
  JAVA_8: [".java"],
  JAVA_11: [".java"],
  JAVA_17: [".java"],
  JAVA_21: [".java"],
  C_17: [".c"],
  CPP_11: [".cpp", ".cc", ".cxx", ".C"],
  CPP_17: [".cpp", ".cc", ".cxx", ".C"],
  JAVASCRIPT_NODE22: [".js", ".mjs"],
  GO_123: [".go"],
};

export interface UploadCodeProps {
  readonly language: Language;
  readonly onLoaded: (source: string) => void;
  readonly disabled?: boolean;
}

export function UploadCode({ language, onLoaded, disabled = false }: UploadCodeProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const [note, setNote] = useState<{ kind: "error" | "warn" | "ok"; text: string } | null>(null);

  const handle = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return;
    setNote(null);

    let text: string;
    try {
      text = await file.text();
    } catch {
      setNote({ kind: "error", text: "That file could not be read." });
      return;
    }

    if (text.length > MAX_SOURCE_CHARS) {
      setNote({
        kind: "error",
        text: `That file is ${text.length.toLocaleString()} characters. The limit is ${MAX_SOURCE_CHARS.toLocaleString()}.`,
      });
      return;
    }

    if (text.trim() === "") {
      // Silently replacing the editor with nothing is the one outcome a student cannot undo.
      setNote({ kind: "error", text: "That file is empty." });
      return;
    }

    const expected = EXPECTED_EXTENSION[language];
    const matches =
      expected === undefined || expected.some((ext) => file.name.toLowerCase().endsWith(ext));

    onLoaded(text);
    setNote(
      matches
        ? { kind: "ok", text: `Loaded ${file.name}.` }
        : {
            kind: "warn",
            text: `Loaded ${file.name}, but ${LANGUAGE_LABEL[language]} is selected. Change the language if that is wrong; the file's contents are what gets judged.`,
          },
    );
  };

  return (
    <div className="flex flex-col gap-1">
      {/*
        A real <input type="file">, visually hidden and driven by the button.
        Not `display: none` — a hidden input is removed from the accessibility tree and cannot be
        reached or labelled, so the control would be unusable by keyboard and invisible to a
        screen reader. `sr-only` keeps it in the tree.
      */}
      <input
        ref={input}
        type="file"
        className="sr-only"
        // A hint for the file picker, never a gate: the handler accepts anything and warns.
        accept=".py,.java,.c,.cpp,.cc,.cxx,.js,.mjs,.go,.txt,text/plain"
        disabled={disabled}
        onChange={(event) => {
          void handle(event.target.files?.[0]);
          // Cleared so choosing the SAME file twice fires change again — otherwise a student who
          // fixes their file and re-uploads it sees nothing happen.
          event.target.value = "";
        }}
        aria-label="Upload code as file"
      />

      {/*
        A bordered quiet button, not an underlined link — hr-challenge-live.png shows "Upload
        Code as File" as a small outlined button at the editor's bottom left, the same weight as
        Run Code and visibly lighter than Submit. The shared `secondary` variant IS that object,
        so this borrows it rather than growing a third button style on the page.
      */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="self-start"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
          <path d="M8 1 4 5h2.5v5h3V5H12L8 1zM2 12v2h12v-2h1.5v3.5h-15V12H2z" />
        </svg>
        Upload Code as File
      </Button>

      {note !== null && (
        /* Mount-time rise; the animation never delays the mount, so the alert/status role
           announces exactly as before. Keyed so a re-upload's fresh note rises again. */
        <p
          key={note.text}
          role={note.kind === "error" ? "alert" : "status"}
          className={note.kind === "error" ? "motion-swap-in text-panther" : "motion-swap-in text-ink/70"}
          style={{ fontSize: "var(--text-xs)" }}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}
