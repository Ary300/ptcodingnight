"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui";
import type { PublicTestResult, SubmissionView } from "@/lib/schemas/api";
import { statementWithoutRepeatedTitle } from "@/lib/contest/statement";
import type { Language } from "@/lib/schemas/judge";

import { contestApi, errorMessageOf } from "../data/backend";
import { useParticipant } from "../data/participant";
import { useResource } from "../data/useResource";
import { useVerdictStream } from "../data/useVerdictStream";
import { CodeEditor } from "../editor/CodeEditor";
import { LanguagePicker } from "../editor/LanguagePicker";
import { UploadCode } from "../editor/UploadCode";
import { LANGUAGE_TEMPLATE } from "../editor/types";
import { SignInRequired } from "../lobby/SignInRequired";
import { Markdown } from "../markdown/Markdown";
import { rememberSource } from "../submissions/source-cache";
import { VerdictPanel } from "../verdict/VerdictPanel";
import { ProblemBreadcrumb, ProblemMetaRail, ProblemStatusPill, ProblemTabs } from "./ProblemMeta";
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

/** A titled slice of the statement, rendered only when the author wrote one. */
function StatementSection({ title, source }: { title: string; source: string }) {
  if (source.trim() === "") return null;
  return (
    <section className="mt-8">
      <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
        {title}
      </h2>
      {/* `max-w-none`: the statement grid column is already the measure, so Markdown's own
          70ch cap would leave a dead gutter inside it. See the main statement below. */}
      <Markdown source={source} className="mt-1 max-w-none" />
    </section>
  );
}

export function ProblemWorkspace({ slug }: ProblemWorkspaceProps) {
  const participant = useParticipant();
  const scopeKey = participant.status === "joined" ? participant.scopeKey : participant.status;
  const load = useCallback(() => contestApi.getProblem(slug), [slug]);
  // A set move revokes this statement even if the route slug does not change. Key the detail on
  // the same server scope as the lobby so stale authorized content disappears immediately.
  const problem = useResource(load, scopeKey);

  // Derived, not synced. The default is the problem's first allowed language, and an
  // explicit choice overrides it — so there is no effect racing the load to set it, and no
  // render where the picker shows a language the problem does not allow.
  const [chosenLanguage, setChosenLanguage] = useState<Language | null>(null);
  const activeLanguage: Language =
    chosenLanguage ?? problem.data?.allowedLanguages[0] ?? "PYTHON_312";

  /*
    What the editor opens with for the active language: the problem's own generated starter
    (the function stub plus the visible stdin/stdout harness, from `ProblemDetail.starters`)
    when the problem declares a signature, and the generic language template otherwise. Most
    of the bank has no signature yet, and a generic template beats an empty box.

    This is a *fallback*, never a clobber. `useDraft` only shows it when the student has no
    stored draft for this (problem, language) pair, and a draft is written by keystrokes
    alone, never by seeding. So:
      - first open: the starter appears;
      - switching language: the new language shows its own draft if the student typed in it,
        its own starter if they never did, and the previous language's work stays in its own
        draft either way. Nothing a student typed is ever replaced by a template implicitly;
        loading the template over their code is only the editor's reset control, which
        confirms first.
  */
  const activeStarter =
    problem.data?.starters?.find((entry) => entry.language === activeLanguage)?.code ??
    LANGUAGE_TEMPLATE[activeLanguage];
  const [source, setSource] = useDraft(slug, activeLanguage, activeStarter);

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

  if (participant.status === "loading" || problem.status === "loading") {
    return (
      <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
        Loading problem…
      </p>
    );
  }

  if (problem.status === "error" || detail === null) {
    /*
      Signed out is a state, not an error — but it is only reported HERE, after the problem read
      has actually failed, and the ordering is deliberate.

      `fetchParticipant()` now keeps "not signed in" separate from "the session route failed".
      Short-circuiting on the participant read before the problem read would still be wrong: a
      transient session check must not hide a statement that already loaded for a valid cookie.

      So the problem wins. If it loaded, the student works. Only when both reads fail does the
      session state explain whether the student should sign in or simply reload after a server
      failure.
    */
    if (participant.status === "error") {
      return (
        <div className="max-w-md rounded-panel border border-panther/35 bg-paper p-4">
          <h1 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
            We could not check your sign-in
          </h1>
          <p role="alert" className="mt-1 text-ink/75" style={{ fontSize: "var(--text-sm)" }}>
            {participant.message}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Reload the page
            </Button>
            <Link
              href="/contest"
              className="inline-flex items-center text-panther underline underline-offset-2"
              style={{ fontSize: "var(--text-xs)" }}
            >
              Back to the problem list
            </Link>
          </div>
        </div>
      );
    }

    if (participant.status === "anonymous") {
      return <SignInRequired level={1} what="this problem" />;
    }

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
    <div>
      {/*
        Breadcrumb, title with its status pill, tabs — HackerRank's header, spanning the full
        width above the split. The limits line that used to live under the title has moved into
        the right-hand rail, where HackerRank puts Difficulty and Max Score, so the title area
        carries the name and its state and nothing else.

        The pill sits on the same row as the title at `sm` and above, and wraps under it at 360px
        rather than squeezing the title into two words per line.
      */}
      <ProblemBreadcrumb slotLabel={detail.slotLabel} title={detail.title} />
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        {/*
          Two steps of the app scale rather than one fixed size: HackerRank's challenge title is
          the largest thing on its page, and 31px of Baskerville at 360px eats three lines of a
          long title. On scale at both ends (DESIGN.md §4) — `--text-lg` then `--text-xl`.
        */}
        <h1 className="min-w-0 font-display font-bold text-[length:var(--text-lg)] sm:text-[length:var(--text-xl)]">
          {detail.title}
        </h1>
        <ProblemStatusPill detail={detail} />
      </div>
      <ProblemTabs slug={slug} />

      {/*
        Statement across the measure with a metadata rail beside it, and the editor as a full-width
        panel BELOW — HackerRank's challenge layout, rather than the side-by-side split this had.

        The difference is not cosmetic. A statement in a half-width column wraps at roughly 45
        characters once the samples' code blocks are in it, and a student reads the problem once
        and then works in the editor for forty minutes. Giving the prose the full measure and the
        editor the full width fits what each is actually for. Below `lg` both stack, statement
        first, which is the order a student needs them in.
      */}
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {/* ---- statement ---- */}
        <article className="min-w-0">
          {/*
            `max-w-none` lifts Markdown's default 70ch measure INSIDE this column only. The grid
            already bounds the statement at `minmax(0,1fr)` next to a 16rem rail, so the 640px cap
            was a second, tighter limit that left a ~190px dead gutter at 1440 — the reference
            runs its statement to the column edge. Every other Markdown call site keeps the 70ch
            default, because nothing else gives it a column that is already a measure.
          */}
          <Markdown
            source={statementWithoutRepeatedTitle(detail.statementMd, detail.title)}
            className="mt-5 max-w-none"
          />

          {/*
            Input, Output and Constraints are separate columns on `Problem`, and an author who has
            already written them into the statement leaves them empty. Rendering the heading anyway
            printed three bold words with nothing under them — which reads as content that failed
            to load rather than as content that was never there.
          */}
          <StatementSection title="Input" source={detail.inputSpec} />
          <StatementSection title="Output" source={detail.outputSpec} />
          <StatementSection title="Constraints" source={detail.constraints} />

          <section className="mt-8">
            <h2 className="mb-3 font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
              Samples
            </h2>
            <SampleIO samples={detail.samples} />
          </section>
        </article>

        {/* ---- metadata rail ---- */}
        <aside className="min-w-0">
          <ProblemMetaRail detail={detail} />
        </aside>
      </div>

      {/* ---- the editor panel, full width, below the statement ---- */}
      <section aria-label="Your solution" className="mt-8">
        {/*
          No `overflow-hidden` on this box, deliberately. It would tidy the dark band's corners
          and it would also crop the editor's focus ring, which is drawn 2px OUTSIDE the textarea
          and therefore outside this border — and a focus ring that is only mostly visible is the
          one part of this panel that has to be exactly visible (G9, keyboard-only submit).
          The header bar and the status strip cover the rounded corners on their own.
        */}
        <div className="rounded-panel border border-rule-edge bg-paper">
          {/*
            ONE toolbar, not two. The picker sits in the editor surface's own `toolbarStart` seat,
            so the selector is on the left of the same tinted strip that carries the reset and
            full-screen icons on the right, which is HackerRank's arrangement.

            It used to be a separate header bar stacked above the surface's strip: two tinted rows
            doing one row's job, and the picker was left behind whenever the editor went full
            screen, which is exactly when a student is most likely to want it.
          */}
          <CodeEditor
            value={source}
            onChange={setSource}
            language={activeLanguage}
            // The same starter the draft was seeded from, so the surface's reset control
            // restores THIS problem's template and its pristine check measures against it.
            template={activeStarter}
            disabled={submitBusy}
            onSubmitShortcut={() => void submit()}
            label={`Solution for ${detail.title}`}
            toolbarStart={
              <LanguagePicker
                value={activeLanguage}
                allowed={detail.allowedLanguages}
                onChange={setChosenLanguage}
                disabled={submitBusy || judging}
              />
            }
          />
        </div>

        {/*
          The action row sits BELOW the panel, not inside it — HackerRank's arrangement, upload on
          the left and the two run controls on the right.

          The two buttons are not the same button and must not look it. `secondary` is an outline
          and `primary` is filled panther, which is the same grey/accent pair HackerRank uses, and
          the judged one restates what it does in its own label. On a phone they wrap to their
          own row and Submit stays last, so the button nearest the thumb is still the deliberate
          one rather than the accidental one.

          `whitespace-nowrap` on both labels: HackerRank's Run Code / Submit Code never break
          mid-label at any width, and ours did at phone widths — the flex-wrap on the row is the
          intended reflow, a two-line button is not. The buttons wrap as whole units instead.
        */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-rule-edge pt-3">
          <UploadCode
            language={activeLanguage}
            disabled={submitBusy || sampleBusy}
            onLoaded={setSource}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              className="whitespace-nowrap"
              onClick={() => void runSamples()}
              disabled={sampleBusy || submitBusy}
            >
              {sampleBusy ? "Running…" : "Run samples"}
            </Button>
            <Button
              type="button"
              className="whitespace-nowrap"
              onClick={() => void submit()}
              disabled={submitBusy || sampleBusy || judging}
            >
              {submitBusy ? "Submitting…" : "Submit for judging"}
            </Button>
          </div>
        </div>

        <p className="mt-2 text-right text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          Running samples is free. Submitting counts.
        </p>

        <div className="mt-4 space-y-4">
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
              queuePosition={stream.submission?.queuePosition ?? null}
            />
          )}

          {/*
            The Hints card is not rendered, and its absence is the fix.

            `HintPanel` still exists and is still correct — what it had nothing to render against
            is the API. `http-backend.ts` rejects `getHintBalance()` with `NOT_IMPLEMENTED` because
            there is no hint endpoint, so the panel took its "no balance" branch on every problem,
            for every student, every time: a bordered card headed "Hints" whose entire content was
            "Hints are not available in this contest." It sat directly below Submit and was the
            last thing on the busiest screen in the product, so every problem page ended by
            announcing a feature that is not there.

            An empty state is for a container that will sometimes have contents. This one never
            will until docs/TODO.md T1 decides what a hint IS — no field in the schema holds hint
            text — and a section that can only ever say "nothing here" should not be a section.

            Restoring it is one line, and `HintPanel` is deliberately left in the tree so that
            restoring it is one line.
          */}
        </div>
      </section>
    </div>
  );
}
