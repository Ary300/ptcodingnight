"use client";

import type { z } from "zod";

import type { SampleCaseSchema } from "@/lib/schemas/api";

import { CopyButton } from "../CopyButton";

/**
 * Sample input and output, with a copy button on each.
 *
 * Samples are published by definition — the contract's own words — so full I/O here is
 * correct and is the one place a student may see expected output. Hidden cases have no such
 * component and no such field.
 *
 * The copy buttons exist because the alternative is students retyping input by hand and
 * then debugging their transcription instead of their algorithm.
 */

type SampleCase = z.infer<typeof SampleCaseSchema>;

function Block({ title, value, what }: { title: string; value: string; what: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-ink/70 uppercase" style={{ fontSize: "var(--text-xs)", letterSpacing: "0.06em" }}>
          {title}
        </h4>
        <CopyButton value={value} what={what} />
      </div>
      {/*
        `whitespace-pre-wrap`, and it is a correctness fix rather than a style choice.

        This was a horizontal `overflow-auto`, and on a 408px box holding 439px of content it
        rendered `3000000000 4000000000 5000000000 6000000000 70000000` — the last value sliced in
        half at the box edge. Technically scrollable; visually indistinguishable from truncated,
        because macOS draws overlay scrollbars that are simply not there until you scroll. A
        student diffing their output against a sample they cannot fully see debugs the wrong thing,
        and this project's own rule about never silently truncating judge output applies with more
        force to the one text a student is asked to reproduce exactly.

        Wrapping preserves every newline (`pre-wrap`, not `normal`) and hides nothing. `break-words`
        covers the pathological case of a single token longer than the line, which would otherwise
        overflow the box and — inside a flex row — the page with it. The copy button still yields
        the exact bytes, so a soft wrap costs nothing to anyone pasting it.

        Vertical `overflow-auto` stays: a long sample is genuinely long, and the box is capped so
        it does not push the editor off the screen.
      */}
      <pre
        tabIndex={0}
        role="region"
        aria-label={what}
        className="mt-1 max-h-48 overflow-y-auto rounded bg-ink p-3 font-mono break-words whitespace-pre-wrap text-paper"
        style={{ fontSize: "var(--text-xs)", lineHeight: "1.6" }}
      >
        {value}
      </pre>
    </div>
  );
}

export interface SampleIOProps {
  samples: readonly SampleCase[];
}

export function SampleIO({ samples }: SampleIOProps) {
  if (samples.length === 0) {
    return (
      <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        This problem has no published samples.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {samples.map((sample, index) => (
        <div key={sample.ordinal}>
          <h3 className="mb-2 font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
            Sample {index + 1}
          </h3>
          {/* Stacks on a phone, side by side from 640px — students are on phones. */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <Block
              title="Input"
              value={sample.input}
              what={`sample ${index + 1} input`}
            />
            <Block
              title="Expected output"
              value={sample.expectedOutput}
              what={`sample ${index + 1} expected output`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
