"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui";
import type { PublicTestResult, SubmissionView } from "@/lib/schemas/api";
import {
  mergeStatementExamples,
  statementWithoutConstraints,
  statementWithoutRepeatedTitle,
} from "@/lib/contest/statement";
import type { Language } from "@/lib/schemas/judge";

import { contestApi, errorMessageOf } from "../data/backend";
import { draftKey, readDraft } from "../data/draft-storage";
import { useParticipant } from "../data/participant";
import { useResource } from "../data/useResource";
import { useVerdictStream } from "../data/useVerdictStream";
import { CodeEditor } from "../editor/CodeEditor";
import { runDiagnostics } from "../editor/decorations/run-diagnostics";
import type { EditorHandle } from "../editor/decorations/goto";
import { LanguagePicker } from "../editor/LanguagePicker";
import { UploadCode } from "../editor/UploadCode";
import { LANGUAGE_TEMPLATE } from "../editor/types";
import { SignInRequired } from "../lobby/SignInRequired";
import { Markdown } from "../markdown/Markdown";
import { rememberSource } from "../submissions/source-cache";
import { VerdictPanel } from "../verdict/VerdictPanel";
import { SubmissionHistory } from "../submissions/SubmissionHistory";
import { rememberStreamed } from "../submissions/live-rows";
import { ProblemBreadcrumb, ProblemMetaRail, ProblemStatusPill } from "./ProblemMeta";
import { problemTabStore, selectProblemTab } from "./problem-tab";
import { ProblemTabs, problemPanelId, problemTabId } from "./ProblemTabs";
import { Examples } from "./Examples";
import { TeamActivity } from "./TeamActivity";
import { useDraft } from "./useDraft";
import { initialLanguageFor, rememberLanguage, rememberedLanguageStore } from "./default-language";
import { useFullBleed } from "../full-bleed";
import { LayoutToggle } from "./LayoutToggle";
import { problemLabel } from "./problem-label";
import { ResultsDrawer } from "./ResultsDrawer";
import { resultsSummary } from "./results-summary";
import { SideBySideWorkspace } from "./SideBySideWorkspace";
import {
  SUBMISSIONS_CLOSED_REASON,
  useWindowClosed,
  type ProblemWindow,
} from "./window-closed";
import { resolveLayout } from "./split-layout";
import {
  layoutStore,
  rememberLayout,
  wideViewportStore,
} from "./split-preference";

/**
 * The problem view: statement, samples, editor, run and submit (PRD §9.1).
 *
 * ## The two buttons are not the same button
 *
 * "Run examples" is free, unjudged, and never creates a Submission. "Submit" counts. They are
 * visually different weights, worded differently, and the judged one restates what it does.
 * A student who submits when they meant to run has lost a real attempt, and no amount of
 * apologising afterwards gives it back.
 *
 * ## Layout
 *
 * Two layouts, chosen with the toggle at the end of the Problem / My submissions strip and
 * remembered in this browser.
 *
 * - "Stacked" gives the statement the full measure and puts the editor below it, in the site's
 *   centred column. The page scrolls.
 * - "Side by side" is HackerRank's test editor (`SideBySideWorkspace`): the workspace claims the
 *   whole window under the top bar, statement pane left, editor pane right, a full-height
 *   divider between, Run and Submit pinned to the bottom, and results in a drawer above them.
 *
 * A student who never chose gets side by side from 1280px and stacked below that. Below 1024px
 * the page is always stacked and the toggle is not offered: a side-by-side editor at 360px is
 * unusable, and students are on phones.
 */

export interface ProblemWorkspaceProps {
  slug: string;
  /** The contest window, read on the server. Null for a viewer with no contest of their own. */
  window?: ProblemWindow | null;
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

export function ProblemWorkspace({ slug, window: contestWindow = null }: ProblemWorkspaceProps) {
  const windowClosed = useWindowClosed(contestWindow);
  const closedNoteId = useId();
  const participant = useParticipant();
  const scopeKey = participant.status === "joined" ? participant.scopeKey : participant.status;
  const load = useCallback(() => contestApi.getProblem(slug), [slug]);
  // A set move revokes this statement even if the route slug does not change. Key the detail on
  // the same server scope as the lobby so stale authorized content disappears immediately.
  const problem = useResource(load, scopeKey);

  // Derived, not synced. The default is Java 21 when the problem offers it (`defaultLanguageFor`),
  // and an explicit choice overrides it — so there is no effect racing the load to set it, and no
  // render where the picker shows a language the problem does not allow.
  const [chosenLanguage, setChosenLanguage] = useState<Language | null>(null);
  const rememberedLanguage = useSyncExternalStore(
    rememberedLanguageStore.subscribe,
    rememberedLanguageStore.getSnapshot,
    rememberedLanguageStore.getServerSnapshot,
  );
  const activeLanguage: Language =
    chosenLanguage ?? initialLanguageFor(problem.data?.allowedLanguages, rememberedLanguage);
  const chooseLanguage = useCallback((language: Language) => {
    setChosenLanguage(language);
    rememberLanguage(language);
  }, []);

  /*
    What the editor opens with for the active language: the problem's own generated starter
    (the function stub plus the visible stdin/stdout harness, from `ProblemDetail.starters`)
    when the problem declares a signature, and the generic language template otherwise. Most
    of the bank has no signature yet, and a generic template beats an empty box.

    This is a *fallback*, never a clobber. `useDraft` only shows it when the student has no
    stored draft for this (problem, language) pair, and a draft is written by keystrokes
    alone, never by seeding. So:
      - first open: the starter appears, or the code last submitted in this language when there
        is one (see `lastSentCode` below);
      - switching language: the new language shows its own draft if the student typed in it,
        its own starter if they never did, and the previous language's work stays in its own
        draft either way. Nothing a student typed is ever replaced by a template implicitly;
        loading the template over their code is only the editor's reset control, which
        confirms first.
  */
  const activeStarter =
    problem.data?.starters?.find((entry) => entry.language === activeLanguage)?.code ??
    LANGUAGE_TEMPLATE[activeLanguage];

  const loadHistory = useCallback(() => contestApi.listSubmissions(), []);
  const history = useResource(loadHistory, scopeKey);

  /*
    What this student last SENT for this problem in this language, read back from the server.

    A returning student with no draft (a new tab, another laptop, a cleared browser) used to see
    the starter template, even under a "Solved" badge. Their last submission is a better starting
    point than the template, so it sits between the draft and the starter. The source route
    answers only to the submission's owner, and the draft key carries the participant, so no
    student is ever shown another's code.
  */
  const contestProblemId = problem.data?.contestProblemId ?? null;
  const lastSentId =
    history.data?.find(
      (entry) => entry.contestProblemId === contestProblemId && entry.language === activeLanguage,
    )?.submissionId ?? null;
  const loadLastSent = useCallback(
    () =>
      lastSentId === null ? Promise.resolve(null) : contestApi.getSubmissionSource(lastSentId),
    [lastSentId],
  );
  const lastSent = useResource(loadLastSent, scopeKey);
  const lastSentCode =
    lastSent.data !== null && lastSent.data.submissionId === lastSentId
      ? lastSent.data.sourceCode
      : null;

  const draftOwner =
    participant.status === "joined"
      ? {
          contestId: participant.participant.contestId,
          participantId: participant.participant.participantId,
        }
      : null;
  const [source, setSource] = useDraft(
    draftOwner,
    slug,
    activeLanguage,
    lastSentCode ?? activeStarter,
  );

  const [lastAction, setLastAction] = useState<"samples" | "judged" | null>(null);
  const [sampleResults, setSampleResults] = useState<readonly PublicTestResult[]>([]);
  // The compiler's output when the last sample run did not compile; it then has no rows.
  const [sampleCompileError, setSampleCompileError] = useState<string | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [seed, setSeed] = useState<SubmissionView | null>(null);
  // The code each kind of run was sent with, so its error lines can follow later edits.
  const [sampleRun, setSampleRun] = useState<{ source: string; language: Language } | null>(null);
  const [judgedSource, setJudgedSource] = useState<string | null>(null);
  const editorHandle = useRef<EditorHandle | null>(null);
  const goToLine = useCallback((line: number, column: number | null) => {
    editorHandle.current?.goTo(line, column);
  }, []);

  // The student's choice holds on every width; it only takes effect where two panes fit.
  const layoutChoice = useSyncExternalStore(
    layoutStore.subscribe,
    layoutStore.getSnapshot,
    layoutStore.getServerSnapshot,
  );
  const wide = useSyncExternalStore(
    wideViewportStore.subscribe,
    wideViewportStore.getSnapshot,
    wideViewportStore.getServerSnapshot,
  );
  const layout = resolveLayout({ choice: layoutChoice, wide });
  const sideBySide = layout === "side";

  // Side by side, the Results drawer. Opened by every run and submit; folded only by the student.
  // `null` until either happens, and then the drawer follows `restored` below.
  const [resultsChoice, setResultsOpen] = useState<boolean | null>(null);
  const freeNoteId = useId();

  const detail = problem.data;

  // The window under the top bar is the workspace's only once there is a problem to put in it;
  // loading and error states keep the ordinary centred column.
  useFullBleed(sideBySide && detail !== null);

  /*
    The last submission on this problem, read once when the page opens.

    The verdict panel used to exist only in memory. A student who refreshed while "judging", whose
    laptop slept, or who came back from a teammate's desk found an empty panel and no sign the
    submission had happened; the verdict was on the Submissions page, which they did not know to
    open. The newest submission for this problem now seeds the panel, so a pending one resumes
    waiting (and the stream picks it up) and a finished one shows its verdict.
  */
  const restored = useMemo(() => {
    if (detail === null || history.data === null) return null;
    return (
      history.data.find((entry) => entry.contestProblemId === detail.contestProblemId) ?? null
    );
  }, [detail, history.data]);

  const stream = useVerdictStream(seed ?? restored);

  /*
    The statement a student is shown, and each example's explanation. Students are not shown a
    Constraints section, at the organizers' request, and the statement's Example section moves
    into the Examples list when every example in it is a published sample. The content files and
    the organizer's editor keep both.
  */
  const examples = useMemo(
    () =>
      detail === null
        ? null
        : mergeStatementExamples(
            statementWithoutConstraints(
              statementWithoutRepeatedTitle(detail.statementMd, detail.title),
            ),
            detail.samples,
          ),
    [detail],
  );

  /*
    The "My submissions" tab: which tab shows, from the address, and every copy of a submission
    the verdict stream has delivered on this page.

    The stream follows one submission at a time, so the copies are kept here, on the component
    that stays mounted, rather than in the tab's panel: a student who submits, switches to the
    tab, submits again and switches back still sees both verdicts arrive without a reload. Kept by
    adjusting state during render, which is React's documented way to follow a changing value
    without an effect; the `includes` check stops it after one extra render per new copy.
  */
  const activeTab = useSyncExternalStore(
    problemTabStore.subscribe,
    problemTabStore.getSnapshot,
    problemTabStore.getServerSnapshot,
  );
  const tabsIdBase = useId();
  const [streamed, setStreamed] = useState<readonly SubmissionView[]>([]);
  const latestStreamed = stream.submission;
  if (latestStreamed !== null && !streamed.includes(latestStreamed)) {
    setStreamed(rememberStreamed(streamed, latestStreamed));
  }

  /*
    The page opens on its last verdict in BOTH layouts, so side by side the drawer starts open
    when there is one. Folded, a restored compile error showed only "Compile error" in the summary
    line, and the instruction that fixes it ("Rename the class Solution to Main.") sat hidden
    inside. Derived rather than set in an effect: the history arrives after the first render, and
    nothing the student did is overridden, because any fold, run or submit makes it their choice.
  */
  const resultsOpen = resultsChoice ?? restored !== null;
  const shownAction = lastAction ?? (restored !== null ? "judged" : null);

  const runSamples = useCallback(async () => {
    // Ctrl+' calls this directly, past the disabled button.
    if (detail === null || windowClosed) return;
    setSampleBusy(true);
    setActionError(null);
    setLastAction("samples");
    setResultsOpen(true);
    setSampleRun({ source, language: activeLanguage });
    try {
      const response = await contestApi.runSamples({
        contestProblemId: detail.contestProblemId,
        language: activeLanguage,
        sourceCode: source,
      });
      setSampleResults(response.results);
      setSampleCompileError(response.compileError ?? null);
    } catch (caught: unknown) {
      setActionError(errorMessageOf(caught));
    } finally {
      setSampleBusy(false);
    }
  }, [activeLanguage, detail, source, windowClosed]);

  /*
    One submission per press, however the press arrives. The button is disabled while a submission
    is in flight or being judged, but Ctrl+Enter in the editor calls this directly, and the disabled
    state only exists after the next render. A held or repeated shortcut, or a shortcut pressed while
    the last verdict is still coming, each made another counted submission. The server also folds an
    identical repeat into the first (REPEAT_SUBMISSION_WINDOW_MS); this keeps it from being asked.
  */
  const submitInFlight = useRef(false);
  const verdictPending = stream.status === "waiting";

  /*
    Leaving with code that was never submitted or saved asks first.

    Ctrl+W, Cmd+W, Ctrl+Shift+W and Cmd+Q are IntelliJ habits (Extend Selection, close the editor
    tab) that no page can intercept, and the browser closes the contest tab on them. The draft
    survives, but the student loses the page mid-thought. So `beforeunload` asks, and only while
    the editor holds code that differs from the starter, the last submission and the last
    Ctrl/Cmd+S: a student who submitted or saved can leave without a prompt.
  */
  const [keptSource, setKeptSource] = useState<string | null>(null);
  const unsaved =
    source !== activeStarter && source !== lastSentCode && source !== keptSource;
  // Every keystroke is written to local storage (`useDraft`), so a reload restores the code and a
  // prompt on it was noise. The prompt now fires only when that write did not land.
  const draftStorageKey =
    draftOwner === null ? null : draftKey(draftOwner, slug, activeLanguage);
  useEffect(() => {
    if (!unsaved) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (draftStorageKey !== null && readDraft(draftStorageKey) === source) return;
      event.preventDefault();
      // Older Chrome and Safari still need returnValue set to show the prompt.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved, draftStorageKey, source]);

  const submit = useCallback(async () => {
    // Ctrl+Enter calls this directly, past the disabled button.
    if (detail === null || submitInFlight.current || verdictPending || windowClosed) return;
    submitInFlight.current = true;
    setSubmitBusy(true);
    setActionError(null);
    setLastAction("judged");
    setResultsOpen(true);
    try {
      const created = await contestApi.submit({
        contestProblemId: detail.contestProblemId,
        language: activeLanguage,
        sourceCode: source,
      });
      // The contract has no `sourceCode` on `SubmissionView`, so "my submissions" cannot
      // show the code without this. See submissions/source-cache.ts.
      rememberSource(created.submissionId, source);
      setJudgedSource(source);
      setKeptSource(source);
      setSeed(created);
    } catch (caught: unknown) {
      setActionError(errorMessageOf(caught));
    } finally {
      submitInFlight.current = false;
      setSubmitBusy(false);
    }
  }, [activeLanguage, detail, source, verdictPending, windowClosed]);

  // The error lines of the run on screen, for the editor's gutter and underlines.
  const submission = stream.submission;
  const diagnostics = useMemo(
    () =>
      runDiagnostics({
        shown: shownAction,
        busy: shownAction === "samples" ? sampleBusy : submitBusy || stream.status === "waiting",
        editorLanguage: activeLanguage,
        samples: {
          source: sampleRun?.source ?? null,
          language: sampleRun?.language ?? null,
          compileError: sampleCompileError,
          results: sampleResults,
        },
        judged: {
          source: judgedSource ?? lastSentCode ?? null,
          language: submission?.language ?? null,
          compileError: submission?.compileError ?? null,
          results: submission?.testResults ?? [],
        },
      }),
    [shownAction, sampleBusy, submitBusy, stream.status, activeLanguage, sampleRun, sampleResults, sampleCompileError, judgedSource, lastSentCode, submission],
  );

  if (participant.status === "loading" || problem.status === "loading") {
    return (
      <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
        Loading problem…
      </p>
    );
  }

  if (problem.status === "error" || detail === null || examples === null) {
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

  /* ---- the blocks both layouts arrange ---- */

  const statement = (
    <>
      {/*
        `max-w-none` lifts Markdown's default 70ch measure INSIDE this column only. Stacked, the
        grid already bounds the statement at `minmax(0,1fr)` next to a 16rem rail; side by side,
        the pane is the measure. Either way a second, tighter cap only leaves a dead gutter.
        Every other Markdown call site keeps the 70ch default.
      */}
      {/*
        Students are not shown a Constraints section, at the organizers' request: the
        statement's own `## Constraints` is cut above (`examples`), and the separate `constraints` column
        is not rendered at all. The content files and the organizer's editor keep both.
      */}
      {/*
        The statement's own Example section is folded into the Examples below when every example
        in it is a published sample (`mergeStatementExamples`), so a student reads each example
        once and can run it. A statement whose examples do not all match keeps its section.
      */}
      <Markdown
        source={examples.statementMd}
        // Side by side, the pane's own padding is the gap under the tabs.
        className={sideBySide ? "max-w-none" : "mt-5 max-w-none"}
        collapseExamples
      />

      {/*
        Input and Output are separate columns on `Problem`, and an author who has already
        written them into the statement leaves them empty. Rendering the heading anyway
        printed bold words with nothing under them, which reads as content that failed to load
        rather than as content that was never there.
      */}
      <StatementSection title="Input" source={detail.inputSpec} />
      <StatementSection title="Output" source={detail.outputSpec} />

      <section className="mt-8">
        <h2 className="mb-3 font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
          Examples
        </h2>
        <Examples
          samples={detail.samples}
          explanations={examples.explanations}
          results={shownAction === "samples" ? sampleResults : []}
          running={shownAction === "samples" && sampleBusy}
          compileFailed={
            shownAction === "samples" &&
            !sampleBusy &&
            (sampleCompileError !== null || sampleResults.some((row) => row.verdict === "CE"))
          }
        />
      </section>
    </>
  );

  const rail = (
    <>
      <ProblemMetaRail detail={detail} />
      {/*
        The shared attempt log, group problems only. The route 404s for individual problems,
        so the gate here is not merely cosmetic - but it IS the reason a student never sees
        a "team activity" panel on a problem where teammates' verdicts would be answer
        sharing.
      */}
      {detail.isGroupProblem && <TeamActivity slug={slug} />}
    </>
  );

  /*
    ONE toolbar, not two. The picker sits in the editor surface's own `toolbarStart` seat, so the
    language tabs are on the left of the same tinted strip that carries the reset and full-screen
    icons on the right, which is HackerRank's arrangement, and they go with the editor into full
    screen. Side by side, `fill` hands the editor's height to the pane.
  */
  const editor = (
    <CodeEditor
      value={source}
      onChange={setSource}
      language={activeLanguage}
      // The same starter the draft was seeded from, so the surface's reset control
      // restores THIS problem's template and its pristine check measures against it.
      template={activeStarter}
      disabled={submitBusy}
      onSubmitShortcut={() => void submit()}
      onSaveShortcut={() => setKeptSource(source)}
      // The same guard as the Run examples button, so a held shortcut is one run.
      onRunShortcut={() => {
        if (!sampleBusy && !submitBusy) void runSamples();
      }}
      label={`Solution for ${detail.title}`}
      fill={sideBySide}
      diagnostics={diagnostics}
      handleRef={editorHandle}
      toolbarStart={
        <LanguagePicker
          value={activeLanguage}
          allowed={detail.allowedLanguages}
          onChange={chooseLanguage}
          disabled={submitBusy || judging}
        />
      }
    />
  );

  const upload = (
    <UploadCode
      language={activeLanguage}
      disabled={submitBusy || sampleBusy}
      onLoaded={setSource}
      compact
    />
  );

  /*
    The two buttons are not the same button and must not look it. `secondary` is an outline and
    `primary` is filled panther, which is the same grey/accent pair HackerRank uses, and the
    judged one restates what it does in its own label. On a phone they wrap to their own row and
    Submit stays last, so the button nearest the thumb is still the deliberate one rather than the
    accidental one.

    `whitespace-nowrap` on both labels: the row's flex-wrap is the intended reflow, a two-line
    button is not. And both are sized by their WIDEST label, not their current one: "Submit for
    judging" collapsing to the shorter "Submitting…" mid-press resized the control under the
    student's cursor. An invisible copy of the long label holds the width; the visible label swaps
    on top of it.
  */
  const runButtons = (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        className="relative whitespace-nowrap"
        onClick={() => void runSamples()}
        disabled={sampleBusy || submitBusy || windowClosed}
        // "Free, not scored" is part of what this button is (PRD §9.1). Stacked shows the
        // sentence under the buttons; side by side keeps it for screen readers only. Once the
        // window has closed the reason it is disabled is the description instead.
        aria-describedby={windowClosed ? closedNoteId : freeNoteId}
        title={windowClosed ? SUBMISSIONS_CLOSED_REASON : undefined}
      >
        <span aria-hidden="true" className="invisible">Run examples</span>
        <span className="absolute inset-0 flex items-center justify-center">
          {sampleBusy ? "Running…" : "Run examples"}
        </span>
      </Button>
      <Button
        type="button"
        className="relative whitespace-nowrap"
        onClick={() => void submit()}
        disabled={submitBusy || sampleBusy || judging || windowClosed}
        aria-describedby={windowClosed ? closedNoteId : undefined}
        title={windowClosed ? SUBMISSIONS_CLOSED_REASON : undefined}
      >
        <span aria-hidden="true" className="invisible">Submit for judging</span>
        <span className="absolute inset-0 flex items-center justify-center">
          {submitBusy ? "Submitting…" : "Submit for judging"}
        </span>
      </Button>
      {/* Screen-reader only, so the HackerRank layout around the buttons does not move. */}
      {windowClosed && (
        <span id={closedNoteId} className="sr-only">
          {SUBMISSIONS_CLOSED_REASON}
        </span>
      )}
    </div>
  );

  const freeNote = "Running examples is free. Submitting counts.";

  /*
    The Hints card is not rendered, and its absence is the fix: `getHintBalance()` has no endpoint
    behind it (docs/TODO.md T1), so the card could only ever say "Hints are not available in this
    contest." `HintPanel` is deliberately left in the tree so that restoring it is one line here.
  */
  const verdicts = (
    <>
      {actionError !== null && (
        <p role="alert" className="text-panther" style={{ fontSize: "var(--text-xs)" }}>
          {actionError}
        </p>
      )}

      {shownAction === "samples" && (
        <VerdictPanel
          mode="samples"
          verdict={!sampleBusy && sampleCompileError !== null ? "CE" : null}
          score={null}
          results={sampleResults}
          compileError={sampleBusy ? null : sampleCompileError}
          busy={sampleBusy}
          language={activeLanguage}
          source={source}
          quiet
          onGoToLine={goToLine}
        />
      )}

      {shownAction === "judged" && (
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
          submittedAt={stream.submission?.submittedAt ?? null}
          language={stream.submission?.language ?? null}
          source={source}
          onGoToLine={goToLine}
        />
      )}
    </>
  );

  const toggle = wide ? <LayoutToggle value={layout} onChange={rememberLayout} /> : undefined;
  const tabs = (
    <ProblemTabs
      active={activeTab}
      onSelect={selectProblemTab}
      idBase={tabsIdBase}
      trailing={toggle}
    />
  );

  /*
    The two panels under the tabs. Only this pane switches; the editor is a sibling of the whole
    pane and is never inside either panel, so a switch cannot reach the student's code.

    The Problem panel stays mounted while hidden, so the statement does not re-render its Markdown
    on every switch. The submissions panel mounts only while it is showing: each visit reads the
    list afresh, and the stream's copies keep it current while it stays open.
  */
  const problemPanel = sideBySide ? (
    <article className="min-w-0">
      {statement}
      {/* Below the samples rather than beside them: a 16rem rail in a 40% pane would
          leave the prose about 40 characters wide. */}
      <div className="mt-8 border-t border-rule-edge pt-4">{rail}</div>
    </article>
  ) : (
    /*
      Stacked: the statement across the measure with the rail beside it, and the editor as
      a full-width panel BELOW. A statement in a half-width column wraps at roughly 45
      characters once the samples' code blocks are in it, so on a narrower laptop the prose
      gets the full measure and the editor the full width. Below `lg` both stack, statement
      first, which is the order a student needs them in.
    */
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <article className="min-w-0">{statement}</article>
      <aside className="min-w-0">{rail}</aside>
    </div>
  );

  const panels = (
    <>
      <div
        role="tabpanel"
        id={problemPanelId(tabsIdBase, "problem")}
        aria-labelledby={problemTabId(tabsIdBase, "problem")}
        hidden={activeTab !== "problem"}
      >
        {problemPanel}
      </div>
      <div
        role="tabpanel"
        id={problemPanelId(tabsIdBase, "submissions")}
        aria-labelledby={problemTabId(tabsIdBase, "submissions")}
        hidden={activeTab !== "submissions"}
        className={sideBySide ? undefined : "mt-6"}
      >
        {activeTab === "submissions" && (
          <SubmissionHistory contestProblemId={detail.contestProblemId} live={streamed} />
        )}
      </div>
    </>
  );

  /*
    ONE tree for both layouts. `SideBySideWorkspace` arranges the stacked page too, so the editor
    is the same DOM node whichever layout is showing: the toggle, or the window crossing 1024px,
    changes classes around the textarea and never rebuilds it, and the student keeps focus, caret
    and undo history mid-word. Only the blocks AROUND the editor differ by layout, below.
  */
  return (
    <SideBySideWorkspace
      stacked={!sideBySide}
      stackedHeader={
        /*
          Breadcrumb, title with its status pill, tabs: HackerRank's header. The limits line
          lives in the right-hand rail, where HackerRank puts Difficulty and Max Score, so the
          title area carries the name and its state and nothing else.

          The pill sits on the same row as the title at `sm` and above, and wraps under it at
          360px rather than squeezing the title into two words per line.
        */
        <>
          <ProblemBreadcrumb slotLabel={detail.slotLabel} title={detail.title} />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            {/*
              Two steps of the app scale rather than one fixed size: HackerRank's challenge title
              is the largest thing on its page, and 31px of Baskerville at 360px eats three lines
              of a long title. On scale at both ends (DESIGN.md §4): `--text-lg` then `--text-xl`.
            */}
            <h1 className="min-w-0 font-display font-bold text-[length:var(--text-lg)] sm:text-[length:var(--text-xl)]">
              {detail.title}
            </h1>
            <ProblemStatusPill detail={detail} />
          </div>
          {tabs}
        </>
      }
      label={problemLabel(detail.slotLabel, detail.title)}
      status={<ProblemStatusPill detail={detail} />}
      tabs={tabs}
      statement={panels}
      editor={editor}
      results={
        sideBySide ? (
          <ResultsDrawer
            open={resultsOpen}
            onOpenChange={setResultsOpen}
            summary={resultsSummary({
              action: shownAction,
              error: actionError,
              sampleBusy,
              sampleResults,
              sampleCompileError,
              submitBusy,
              judging,
              verdict: stream.submission?.verdict ?? null,
              windowClosed,
            })}
          >
            {shownAction === null && actionError === null ? (
              <p className="pt-2 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
                Run examples to see your results here.
              </p>
            ) : (
              <div className="space-y-3 pt-2">{verdicts}</div>
            )}
          </ResultsDrawer>
        ) : (
          <>
            <p id={freeNoteId} className="sr-only">
              {freeNote}
            </p>
            <div className="mt-4 space-y-4">{verdicts}</div>
          </>
        )
      }
      actions={
        sideBySide ? (
          /*
            Pinned to the bottom of the pane: upload on the left, the two run controls on the
            right, where HackerRank keeps Run Code and Submit Code, and no copy between them. The
            free-run note is the Run button's description, for screen readers.
          */
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-rule-edge bg-ink/[0.03] px-4 py-2.5">
            {upload}
            <p id={freeNoteId} className="sr-only">
              {freeNote}
            </p>
            {runButtons}
          </div>
        ) : (
          /* BELOW the editor panel, not inside it: upload left, run controls right. */
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-rule-edge pt-3">
            {upload}
            {runButtons}
          </div>
        )
      }
    />
  );
}
