"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui";
import type { PublicTestResult, SubmissionView } from "@/lib/schemas/api";
import type { Language } from "@/lib/schemas/judge";

import { contestApi, errorMessageOf } from "../data/backend";
import { useResource } from "../data/useResource";
import { useVerdictStream } from "../data/useVerdictStream";
import { CodeEditor } from "../editor/CodeEditor";
import { LanguagePicker } from "../editor/LanguagePicker";
import { LANGUAGE_TEMPLATE } from "../editor/types";
import { HintPanel } from "../hints/HintPanel";
import { Markdown } from "../markdown/Markdown";
import { rememberSource } from "../submissions/source-cache";
import { VerdictPanel } from "../verdict/VerdictPanel";
import { SampleIO } from "./SampleIO";
import { useDraft } from "./useDraft";

/**
 * The problem view: statement, constraints, samples, editor, run and submit (PRD §9.1).
 *
 * ## The two buttons are not the same button
 *
 * "Run samples" is free, unjudged, and never creates a Submission. "Submit" counts. They are
 * visually different weights, worded differently, and the judged one restates what it does.
 * A student who submits when they meant to run has lost a real attempt, and no amount of
 * apologising afterwards gives it back.
 *
 * ## Layout
 *
 * One column below 1024px — students are on phones, and a side-by-side editor at 360px is
 * unusable. Statement on the left, work on the right above that.
 */

export interface ProblemWorkspaceProps {
  slug: string;
}

export function ProblemWorkspace({ slug }: ProblemWorkspaceProps) {
  const load = useCallback(() => contestApi.getProblem(slug), [slug]);
  const problem = useResource(load);

  // Derived, not synced. The default is the problem's first allowed language, and an
  // explicit choice overrides it — so there is no effect racing the load to set it, and no
  // render where the picker shows a language the problem does not allow.
  const [chosenLanguage, setChosenLanguage] = useState<Language | null>(null);
  const activeLanguage: Language =
    chosenLanguage ?? problem.data?.allowedLanguages[0] ?? "PYTHON";
  const [source, setSource] = useDraft(slug, activeLanguage, LANGUAGE_TEMPLATE[activeLanguage]);

  const [lastAction, setLastAction] = useState<"samples" | "judged" | null>(null);
  const [sampleResults, setSampleResults] = useState<readonly PublicTestResult[]>([]);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [seed, setSeed] = useState<SubmissionView | null>(null);

  const stream = useVerdictStream(seed);

  const detail = problem.data;

  const runSamples = useCallback(async () => {
    if (detail === null) return;
    setSampleBusy(true);
    setActionError(null);
    setLastAction("samples");
    try {
      const response = await contestApi.runSamples({
        contestProblemId: detail.contestProblemId,
        language: activeLanguage,
        sourceCode: source,
      });
      setSampleResults(response.results);
    } catch (caught: unknown) {
      setActionError(errorMessageOf(caught));
    } finally {
      setSampleBusy(false);
    }
  }, [activeLanguage, detail, source]);

  const submit = useCallback(async () => {
    if (detail === null) return;
    setSubmitBusy(true);
    setActionError(null);
    setLastAction("judged");
    try {
      const created = await contestApi.submit({
        contestProblemId: detail.contestProblemId,
        language: activeLanguage,
        sourceCode: source,
      });
      // The contract has no `sourceCode` on `SubmissionView`, so "my submissions" cannot
      // show the code without this. See submissions/source-cache.ts.
      rememberSource(created.submissionId, source);
      setSeed(created);
    } catch (caught: unknown) {
      setActionError(errorMessageOf(caught));
    } finally {
      setSubmitBusy(false);
    }
  }, [activeLanguage, detail, source]);

  if (problem.status === "loading") {
    return (
      <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
        Loading problem…
      </p>
    );
  }

  if (problem.status === "error" || detail === null) {
    return (
      <div>
        <p role="alert" className="text-panther" style={{ fontSize: "var(--text-sm)" }}>
          {problem.error ?? "That problem could not be loaded."}
        </p>
        <Link href="/contest" className="mt-3 inline-block text-panther underline underline-offset-2" style={{ fontSize: "var(--text-xs)" }}>
          Back to the problem list
        </Link>
      </div>
    );
  }

  const judging = stream.status === "waiting";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ---- statement ---- */}
      <article className="min-w-0">
        <header>
          <p className="numeric text-panther" style={{ fontSize: "var(--text-sm)" }}>
            {detail.slotLabel}
          </p>
          <h1 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
            {detail.title}
          </h1>
          <p className="numeric mt-1 text-ink/65" style={{ fontSize: "var(--text-xs)" }}>
            {detail.basePoints} pts · {detail.timeLimitMs} ms · {detail.memoryLimitMb} MB
          </p>
        </header>

        <Markdown source={detail.statementMd} className="mt-5" />

        <section className="mt-8">
          <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
            Input
          </h2>
          <Markdown source={detail.inputSpec} className="mt-1" />

          <h2 className="mt-6 font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
            Output
          </h2>
          <Markdown source={detail.outputSpec} className="mt-1" />

          <h2 className="mt-6 font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
            Constraints
          </h2>
          <Markdown source={detail.constraints} className="mt-1" />
        </section>

        <section className="mt-8">
          <h2 className="mb-3 font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
            Samples
          </h2>
          <SampleIO samples={detail.samples} />
        </section>
      </article>

      {/* ---- work ---- */}
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LanguagePicker
            value={activeLanguage}
            allowed={detail.allowedLanguages}
            onChange={setChosenLanguage}
            disabled={submitBusy || judging}
          />
          <span className="text-ink/55" style={{ fontSize: "var(--text-xs)" }}>
            Your work is kept in this tab until you close it.
          </span>
        </div>

        <CodeEditor
          value={source}
          onChange={setSource}
          language={activeLanguage}
          disabled={submitBusy}
          onSubmitShortcut={() => void submit()}
          label={`Solution for ${detail.title}`}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void runSamples()}
            disabled={sampleBusy || submitBusy}
          >
            {sampleBusy ? "Running…" : "Run samples"}
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={submitBusy || sampleBusy || judging}
          >
            {submitBusy ? "Submitting…" : "Submit for judging"}
          </Button>
          <span className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            Running samples is free. Submitting counts.
          </span>
        </div>

        {actionError !== null && (
          <p role="alert" className="text-panther" style={{ fontSize: "var(--text-xs)" }}>
            {actionError}
          </p>
        )}

        {lastAction === "samples" && (
          <VerdictPanel
            mode="samples"
            verdict={null}
            score={null}
            results={sampleResults}
            compileError={null}
            busy={sampleBusy}
          />
        )}

        {lastAction === "judged" && (
          <VerdictPanel
            mode="judged"
            verdict={stream.submission?.verdict ?? null}
            score={stream.submission?.score ?? null}
            results={stream.submission?.testResults ?? []}
            compileError={stream.submission?.compileError ?? null}
            busy={submitBusy || judging}
            transport={stream.transport}
            error={stream.error}
          />
        )}

        <HintPanel contestProblemId={detail.contestProblemId} problemTitle={detail.title} />
      </div>
    </div>
  );
}
