"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { Select, TextArea, TextInput } from "@/components/admin/Field";
import { Markdown } from "@/components/contest/markdown/Markdown";
import { Button } from "@/components/ui";
import { LANGUAGE_IDS, VARIANTS, type LanguageId } from "@/lib/judge/runtimes";
import { starterFor } from "@/lib/judge/starters";
import {
  API_ROUTES,
  CreateProblemResponseSchema,
  type CreateProblemRequest,
} from "@/lib/schemas/api";
import { SignatureSchema, type Signature } from "@/lib/schemas/seed";

/**
 * Write a coding question, the Park Tudor way: HackerRank's wizard with the two steps we do not
 * need taken out.
 *
 * HackerRank's flow is Question Details → Languages → Code Stubs → Testcases. Ours is three steps,
 * because two of theirs are decisions we have already made for every question:
 *
 *   - there is no TYPE step: every question here is a coding question;
 *   - there is no LANGUAGES step: every question runs in all ten variants, always.
 *
 * So the steps are Details, Starter code (optional), and Test cases. The step rail on the left is
 * HackerRank's, and it is a real navigation aid rather than decoration: a long question is written
 * over several sittings, and the rail says which parts are done.
 *
 * All state lives in this one component. A create is a single POST to /api/admin/problems; an edit
 * is a single PATCH to /api/admin/problems/{slug}. Both write the test files and the rows on the
 * server, and both are refused by the same checks, because both call the same function there.
 *
 * ## Why one component does both
 *
 * A separate edit form would be a second answer to "what makes a question valid", and this codebase
 * has already paid for that kind of drift: `components/admin/contract.ts` hand-wrote a server type
 * and it listed two of the ten languages the judge runs. The differences between creating and
 * editing are three: where the request goes, what the button says, and whether the fields start
 * empty. Everything else is the same screen and stays one screen.
 *
 * ## The edit form starts FULL, and that is the whole point
 *
 * `edit.initial` carries the statement, the signature, and every test case with its input and its
 * expected output READ BACK OFF DISK, because `TestCase` stores a path rather than a blob. A form
 * populated from the rows alone would show empty boxes beside cases that have real content, and the
 * first Save would make the screen true by destroying the data.
 */

const SIGNATURE_TYPES = [
  "int",
  "long",
  "string",
  "int[]",
  "long[]",
  "string[]",
] as const;
type SignatureType = (typeof SIGNATURE_TYPES)[number];

interface DraftParam {
  readonly id: number;
  name: string;
  type: SignatureType;
}

interface DraftCase {
  readonly id: number;
  input: string;
  expectedOutput: string;
  isSample: boolean;
}

type StepKey = "details" | "starter" | "tests";

/**
 * What the student preview can say about starter code. Four honest states, because the preview
 * must never render a stub the save would not produce: `locked` is a stored harness this flat
 * form cannot express, and `invalid` is a signature the schema (or an emitter) would refuse.
 */
type PreviewStarter =
  | { readonly kind: "off" }
  | { readonly kind: "locked" }
  | { readonly kind: "invalid" }
  | { readonly kind: "ready"; readonly signature: Signature };

const STEPS: readonly { key: StepKey; title: string; blurb: string }[] = [
  {
    key: "details",
    title: "Question details",
    blurb: "Title, statement, difficulty",
  },
  { key: "starter", title: "Starter code", blurb: "Optional function stub" },
  { key: "tests", title: "Test cases", blurb: "Input and expected output" },
];

let nextId = 1;
const makeId = (): number => (nextId += 1);

/** The starter-code signature in the flat form this builder collects, as it comes back for an edit. */
export interface ProblemBuilderSignature {
  readonly name: string;
  readonly returns: SignatureType;
  readonly params: readonly {
    readonly name: string;
    readonly type: SignatureType;
  }[];
}

export interface ProblemBuilderCase {
  readonly input: string;
  readonly expectedOutput: string;
  readonly isSample: boolean;
}

/** Everything an existing question starts the form with. Mirrors `AuthoredProblemDraft`. */
export interface ProblemBuilderInitial {
  readonly title: string;
  readonly statementMd: string;
  readonly inputSpec: string;
  readonly outputSpec: string;
  readonly constraints: string;
  readonly difficulty: "E" | "M" | "H" | null;
  /** GROUP is the organizer's "team question": the whole team works it at once. */
  readonly round: "INDIVIDUAL" | "GROUP";
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  /** Null means the default, whitespace. */
  readonly comparator: { kind: "whitespace" } | { kind: "exact" } | { kind: "float"; epsilon: number } | null;
  readonly referenceSolution: string | null;
  readonly referenceLanguage: LanguageId | null;
  readonly referenceValidatedAt: string | null;
  readonly signature: ProblemBuilderSignature | null;
  /**
   * False when a signature IS stored but this flat form cannot express it exactly, which is the
   * case for a hand-authored `problem.json` using shared fields or a repeat loop. The starter step
   * then explains itself, and saving leaves the stored signature alone.
   */
  readonly signatureEditable: boolean;
  readonly testCases: readonly ProblemBuilderCase[];
}

export interface ProblemBuilderEdit {
  readonly slug: string;
  readonly initial: ProblemBuilderInitial;
}

export interface ProblemBuilderProps {
  /** Omit to create a new question. Supply it to edit an existing one. */
  readonly edit?: ProblemBuilderEdit;
}

type Designation = "E" | "M" | "H" | "TEAM";

export function ProblemBuilder({ edit }: ProblemBuilderProps = {}) {
  const router = useRouter();
  const initial = edit?.initial;
  const [step, setStep] = useState<StepKey>("details");
  /*
    Which steps the organizer has actually been to. The rail's check used to mean only "this
    step's predicate holds", and the starter step's predicate holds VACUOUSLY on a blank form
    (starter code is optional, so an untouched step is a satisfied step) - so a brand-new
    question opened with step 2 already wearing a check mark, which reads as "you did this".
    A check now means BEEN THERE AND SATISFIED; an unvisited step shows its number no matter
    what its predicate says. Editing an existing question starts fully visited, because every
    step genuinely happened when the question was written.
  */
  const [visited, setVisited] = useState<ReadonlySet<StepKey>>(
    () => new Set<StepKey>(edit === undefined ? ["details"] : ["details", "starter", "tests"]),
  );
  const goToStep = (key: StepKey): void => {
    setVisited((prev) => (prev.has(key) ? prev : new Set([...prev, key])));
    setStep(key);
  };

  // --- details ---
  const [title, setTitle] = useState(initial?.title ?? "");
  const [statementMd, setStatementMd] = useState(initial?.statementMd ?? "");
  const [inputSpec, setInputSpec] = useState(initial?.inputSpec ?? "");
  const [outputSpec, setOutputSpec] = useState(initial?.outputSpec ?? "");
  const [constraints, setConstraints] = useState(initial?.constraints ?? "");
  /*
    The fourth designation is TEAM: past-contest spreadsheets tier questions as easy, medium,
    hard or team, and a team question has no tier of its own - the whole team works it at once
    (round GROUP), and its points are set in the contest line-up.
  */
  const [designation, setDesignation] = useState<Designation>(
    initial === undefined
      ? "E"
      : initial.round === "GROUP"
        ? "TEAM"
        : (initial.difficulty ?? "E"),
  );

  // --- judge settings (Advanced: the defaults are right for nearly every question) ---
  const [timeLimitMs, setTimeLimitMs] = useState<number>(initial?.timeLimitMs ?? 2000);
  const [memoryLimitMb, setMemoryLimitMb] = useState<number>(initial?.memoryLimitMb ?? 256);
  const [comparatorKind, setComparatorKind] = useState<"whitespace" | "exact" | "float">(
    initial?.comparator?.kind ?? "whitespace",
  );
  const [epsilon, setEpsilon] = useState<string>(
    initial?.comparator?.kind === "float" ? String(initial.comparator.epsilon) : "0.000001",
  );

  // --- reference solution ---
  const [referenceCode, setReferenceCode] = useState(initial?.referenceSolution ?? "");
  const [referenceLanguage, setReferenceLanguage] = useState<LanguageId>(
    initial?.referenceLanguage ?? "PYTHON_312",
  );
  /** The stored stamp; any save clears it server-side, so it only describes saved content. */
  const referenceValidatedAt = initial?.referenceValidatedAt ?? null;

  // --- starter code ---
  // A question whose stored signature this form cannot represent keeps it: the checkbox is not
  // rendered at all, and `signature` is left out of the PATCH entirely.
  const signatureLocked = initial !== undefined && !initial.signatureEditable;
  const [wantStarter, setWantStarter] = useState(initial?.signature != null);
  const [fnName, setFnName] = useState(initial?.signature?.name ?? "solve");
  const [returns, setReturns] = useState<SignatureType>(
    initial?.signature?.returns ?? "int",
  );
  const [params, setParams] = useState<DraftParam[]>(() =>
    initial?.signature != null && initial.signature.params.length > 0
      ? initial.signature.params.map((p) => ({
          id: makeId(),
          name: p.name,
          type: p.type,
        }))
      : [{ id: makeId(), name: "n", type: "int" }],
  );

  // --- test cases ---
  const [cases, setCases] = useState<DraftCase[]>(() =>
    initial !== undefined && initial.testCases.length > 0
      ? initial.testCases.map((c) => ({
          id: makeId(),
          input: c.input,
          expectedOutput: c.expectedOutput,
          isSample: c.isSample,
        }))
      : [{ id: makeId(), input: "", expectedOutput: "", isSample: true }],
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The receipt for "Create and add another": the title just saved, shown in the footer of the
  // freshly reset form so the organizer knows the save landed before typing the next question.
  const [created, setCreated] = useState<string | null>(null);

  /*
    Which repeatable cards were created AFTER this form mounted. Stored rows arrive with the
    page (covered by the template's page-level rise), so animating them too would be a double
    entrance on every mount; only a card the organizer just added should rise. State, not a ref,
    because it is read during render and the React Compiler rules refuse ref reads there. The
    initializer runs after the `params`/`cases` initializers above, so it captures the counter
    with every initial card already minted.
  */
  const [freshFrom, setFreshFrom] = useState(() => nextId);
  /* Bumped by "Create and add another": the whole section body re-keys so the reset form (and
     its receipt) arrives as one followable change rather than a same-frame blanking. */
  const [resetCount, setResetCount] = useState(0);

  /**
   * The signature as the student preview will generate stubs from it, validated by the SAME
   * schema the server uses. The array-count wiring here mirrors `buildSignature` in
   * `lib/contest/problem-author.ts` line for line — that module is server-only (it imports
   * node:fs), so the wiring is restated rather than imported; if you change one, change both.
   */
  const previewStarter = useMemo<PreviewStarter>(() => {
    if (signatureLocked) return { kind: "locked" };
    if (!wantStarter) return { kind: "off" };

    const fields: {
      name: string;
      type: SignatureType;
      length?: string;
      passed?: boolean;
    }[] = [];
    for (const param of params) {
      const name = param.name.trim();
      if (name === "") continue;
      if (param.type.endsWith("[]")) {
        const countName = `${name}Count`;
        fields.push({ name: countName, type: "int", passed: false });
        fields.push({ name, type: param.type, length: countName });
      } else {
        fields.push({ name, type: param.type });
      }
    }
    const candidate = {
      name: fnName.trim(),
      returns: returns.endsWith("[]")
        ? { type: returns, join: " " }
        : { type: returns },
      params: fields,
    };
    const parsed = SignatureSchema.safeParse(candidate);
    return parsed.success
      ? { kind: "ready", signature: parsed.data }
      : { kind: "invalid" };
  }, [signatureLocked, wantStarter, fnName, returns, params]);

  const sampleCount = useMemo(
    () => cases.filter((c) => c.isSample).length,
    [cases],
  );

  const detailsComplete = title.trim() !== "" && statementMd.trim() !== "";
  const testsComplete =
    cases.length > 0 &&
    sampleCount > 0 &&
    cases.every((c) => c.expectedOutput.trim() !== "");
  /** Nothing left to fix on this step: either a named function, or deliberately no starter. */
  const starterComplete =
    signatureLocked || !wantStarter || fnName.trim() !== "";
  /*
    Did the organizer actually SET UP starter code, as opposed to passing through the step?

    `starterComplete` is vacuously true on a blank form, because starter code is optional and an
    untouched step has nothing wrong with it. That made the rail claim a step was done the moment
    somebody pressed Next and Back: the organizer reported a check mark on "Starter code" while
    standing on step 1, having configured nothing. A check has to mean WORK EXISTS HERE, so the
    rail and the review both ask this instead: a stored harness this form cannot edit, or a
    function the organizer named.
  */
  const starterConfigured = signatureLocked || (wantStarter && fnName.trim() !== "");
  const stepIndex = STEPS.findIndex((entry) => entry.key === step);

  /**
   * `andAnother` is HackerRank's "Save & Create Another": the same POST, but on success the form
   * resets to blank for the next question instead of navigating to the bank. Create-mode only —
   * an edit has exactly one question to land on.
   */
  const save = useCallback(async (andAnother: boolean) => {
    setSubmitting(true);
    setError(null);
    setCreated(null);
    try {
      const common = {
        title: title.trim(),
        statementMd,
        inputSpec: inputSpec.trim() === "" ? undefined : inputSpec,
        outputSpec: outputSpec.trim() === "" ? undefined : outputSpec,
        constraints: constraints.trim() === "" ? undefined : constraints,
        difficulty: designation === "TEAM" ? null : designation,
        round: (designation === "TEAM" ? "GROUP" : "INDIVIDUAL") as "GROUP" | "INDIVIDUAL",
        timeLimitMs,
        memoryLimitMb,
        // The default is not sent, so a stored explicit "whitespace" and an untouched form both
        // land in the same place and the column stays null until someone chooses.
        comparator:
          comparatorKind === "whitespace"
            ? undefined
            : comparatorKind === "exact"
              ? ({ kind: "exact" } as const)
              : ({ kind: "float", epsilon: Number(epsilon) || 0.000001 } as const),
        referenceSolution: referenceCode.trim() === "" ? null : referenceCode,
        referenceLanguage: referenceCode.trim() === "" ? null : referenceLanguage,
        testCases: cases.map((c) => ({
          input: c.input,
          expectedOutput: c.expectedOutput,
          isSample: c.isSample,
        })),
      };
      const signature = wantStarter
        ? {
            name: fnName.trim(),
            returns,
            params: params
              .filter((p) => p.name.trim() !== "")
              .map((p) => ({ name: p.name.trim(), type: p.type })),
          }
        : null;
      // OMITTED, not sent as null, when the stored signature is one this form cannot represent.
      // `null` is a request to REMOVE the starter code, and sending it because a checkbox the
      // organizer never saw happened to be unchecked would delete a harness nobody touched.
      const body: CreateProblemRequest = signatureLocked
        ? common
        : { ...common, signature };

      const response = await fetch(
        edit === undefined
          ? API_ROUTES.adminProblems
          : `${API_ROUTES.adminProblems}/${encodeURIComponent(edit.slug)}`,
        {
          method: edit === undefined ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload
            ? (payload as { error: { message?: string } }).error.message
            : undefined;
        setError(message ?? "The question could not be saved.");
        return;
      }
      const data =
        typeof payload === "object" && payload !== null && "data" in payload
          ? (payload as { data: unknown }).data
          : null;
      const parsed = CreateProblemResponseSchema.safeParse(data);
      if (!parsed.success) {
        setError("The server returned an unexpected response.");
        return;
      }
      if (edit === undefined && andAnother) {
        // Saved; now hand back a blank form. Every field returns to its create-mode default,
        // and the footer names what was just created so the save is visibly not lost.
        setCreated(title.trim());
        setTitle("");
        setStatementMd("");
        setInputSpec("");
        setOutputSpec("");
        setConstraints("");
        setDesignation("E");
        setTimeLimitMs(2000);
        setMemoryLimitMb(256);
        setComparatorKind("whitespace");
        setEpsilon("0.000001");
        setReferenceCode("");
        setReferenceLanguage("PYTHON_312");
        setWantStarter(false);
        setFnName("solve");
        setReturns("int");
        setParams([{ id: makeId(), name: "n", type: "int" }]);
        setCases([{ id: makeId(), input: "", expectedOutput: "", isSample: true }]);
        // The reset's default cards were just minted above, and they are furniture, not
        // additions: move the freshness line past them so they do not rise inside the body
        // that is already rising.
        setFreshFrom(nextId);
        setResetCount((n) => n + 1);
        setStep("details");
        // A blank form has been nowhere. Without this, the second question of the night opens
        // with every step already checked, because the visited set survived the reset.
        setVisited(new Set<StepKey>(["details"]));
        window.scrollTo({ top: 0 });
        router.refresh();
        return;
      }
      // A create lands on the bank, where the new question is now listed and cleared for a
      // contest. An edit lands on the question itself, whose preview shows what it now says.
      router.push(
        edit === undefined
          ? "/admin/problems"
          : `/admin/problems/${parsed.data.slug}`,
      );
      router.refresh();
    } catch {
      setError("We could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }, [
    title,
    statementMd,
    inputSpec,
    outputSpec,
    constraints,
    designation,
    timeLimitMs,
    memoryLimitMb,
    comparatorKind,
    epsilon,
    referenceCode,
    referenceLanguage,
    wantStarter,
    signatureLocked,
    fnName,
    returns,
    params,
    cases,
    edit,
    router,
  ]);

  return (
    <div className="grid gap-group lg:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <nav aria-label="Question sections">
          <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {STEPS.map((entry, index) => {
              const active = step === entry.key;
              /*
                A check means BEHIND YOU AND SATISFIED. The step being worked on always shows
                its number: the organizer looked at "Step 2 of 3", then at a rail whose second
                entry wore a check mark instead of a 2, and reasonably asked what was done about
                a step they had not finished reading. Visited-and-satisfied was the first fix;
                excluding the ACTIVE step is the second half of the same truth.
              */
              const done =
                !active &&
                visited.has(entry.key) &&
                ((entry.key === "details" && detailsComplete) ||
                  (entry.key === "starter" && starterConfigured) ||
                  (entry.key === "tests" && testsComplete));

              return (
                <li key={entry.key} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    onClick={() => goToStep(entry.key)}
                    aria-current={active ? "step" : undefined}
                    /* `duration-[var(--motion-swap)]`: the bare `transition-colors` ran at
                       Tailwind's default 150ms, off the scale. A whole rail row is a large
                       surface whose only hover channel is colour, so it takes the swap
                       duration rather than the press one - a big ground repainting in 100ms
                       reads as a flicker rather than a response. */
                    className={`flex w-full items-center gap-3 border-l-2 px-3 py-3 text-left transition-colors duration-[var(--motion-swap)] ${
                      active
                        ? "border-panther bg-paper"
                        : "border-transparent hover:bg-paper"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`numeric flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                        done
                          ? "border-ink bg-ink text-paper"
                          : active
                            ? "border-panther text-panther"
                            : "border-rule-firm text-ink/70"
                      }`}
                      style={{ fontSize: "var(--text-xs)" }}
                    >
                      {done ? "✓" : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span
                        className="block font-semibold"
                        style={{ fontSize: "var(--text-sm)" }}
                      >
                        {entry.title}
                      </span>
                      <span
                        className="block text-ink/60"
                        style={{ fontSize: "var(--text-xs)" }}
                      >
                        {entry.blurb}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mt-group hidden lg:block">
          <QualityReview
            detailsComplete={detailsComplete}
            starterComplete={starterConfigured}
            expectedOutputsComplete={cases.every(
              (testCase) => testCase.expectedOutput.trim() !== "",
            )}
            caseCount={cases.length}
            sampleCount={sampleCount}
            formatsComplete={inputSpec.trim() !== "" && outputSpec.trim() !== ""}
            constraintsComplete={constraints.trim() !== ""}
            referenceProvided={referenceCode.trim() !== ""}
            validated={referenceValidatedAt !== null}
          />
        </div>
      </div>

      <section className="min-w-0 overflow-hidden rounded-panel border border-rule-edge bg-paper">
        <BuilderHeader
          step={stepIndex + 1}
          title={STEPS[stepIndex]?.title ?? "Question"}
          description={
            step === "details"
              ? "Write the challenge exactly as students will receive it."
              : step === "starter"
                ? "Choose the function students complete, or start them with a blank editor."
                : "Add the sample and hidden cases that the judge will run."
          }
          action={
            // On every step, not only Details: the preview is most useful from the Starter and
            // Tests steps, where the stub and the samples it renders are being written.
            <PreviewButton
              title={title}
              statementMd={statementMd}
              inputSpec={inputSpec}
              outputSpec={outputSpec}
              constraints={constraints}
              cases={cases}
              starter={previewStarter}
            />
          }
        />

        {/*
          Keyed so the entrance re-runs on every step switch (the wizard body swaps wholesale,
          several times per question) and once more on the "Create and add another" reset, whose
          receipt lands at the top the same scroll already goes to. Without the key the class
          would animate exactly once, on mount.

          `motion-panel-in`, not `motion-swap-in`: this is a whole surface replacing a whole
          surface, and at the swap duration the organizer read the step change as "instant or
          too fast". Bigger things move slower is the scale's own rule; the panel step is the
          duration built for exactly this size of arrival.
        */}
        <div
          key={`${step}-${String(resetCount)}`}
          className="motion-panel-in flex flex-col gap-group p-5 sm:p-8"
        >
          {step === "details" && (
            <DetailsStep
              title={title}
              setTitle={setTitle}
              statementMd={statementMd}
              setStatementMd={setStatementMd}
              inputSpec={inputSpec}
              setInputSpec={setInputSpec}
              outputSpec={outputSpec}
              setOutputSpec={setOutputSpec}
              constraints={constraints}
              setConstraints={setConstraints}
              designation={designation}
              setDesignation={setDesignation}
              timeLimitMs={timeLimitMs}
              setTimeLimitMs={setTimeLimitMs}
              memoryLimitMb={memoryLimitMb}
              setMemoryLimitMb={setMemoryLimitMb}
              comparatorKind={comparatorKind}
              setComparatorKind={setComparatorKind}
              epsilon={epsilon}
              setEpsilon={setEpsilon}
            />
          )}

          {step === "starter" && (
            <StarterStep
              signatureLocked={signatureLocked}
              wantStarter={wantStarter}
              setWantStarter={setWantStarter}
              fnName={fnName}
              setFnName={setFnName}
              returns={returns}
              setReturns={setReturns}
              params={params}
              setParams={setParams}
              freshFrom={freshFrom}
            />
          )}

          {step === "tests" && (
            <TestsStep
              cases={cases}
              setCases={setCases}
              sampleCount={sampleCount}
              freshFrom={freshFrom}
              referenceCode={referenceCode}
              setReferenceCode={setReferenceCode}
              referenceLanguage={referenceLanguage}
              setReferenceLanguage={setReferenceLanguage}
              referenceValidatedAt={referenceValidatedAt}
              timeLimitMs={timeLimitMs}
              memoryLimitMb={memoryLimitMb}
              editSlug={edit?.slug ?? null}
            />
          )}
        </div>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-rule-edge bg-paper/95 px-5 py-4 backdrop-blur sm:px-8">
          {/* The footer line swaps between three states in the same frame as the save or the
              refusal; the rise makes the swap legible and leaves the announcement alone. */}
          {error !== null ? (
            <p
              role="alert"
              className="motion-swap-in font-semibold text-panther"
              style={{ fontSize: "var(--text-sm)" }}
            >
              {error}
            </p>
          ) : created !== null ? (
            <p
              role="status"
              className="motion-swap-in font-semibold"
              style={{ fontSize: "var(--text-sm)" }}
            >
              Created &ldquo;{created}&rdquo;. The form is reset for the next
              question.
            </p>
          ) : (
            <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              {!detailsComplete
                ? "Add a question name and problem statement before saving."
                : !starterComplete
                  ? "Name the starter function, or turn starter code off."
                  : !testsComplete
                    ? "Every case needs expected output, and at least one case must be a sample."
                    : edit === undefined
                      ? "This question is ready to create."
                      : "Your changes are ready to save."}
            </p>
          )}

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() =>
                router.push(
                  edit === undefined
                    ? "/admin/problems"
                    : `/admin/problems/${edit.slug}`,
                )
              }
            >
              Cancel
            </Button>
            {stepIndex > 0 && (
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => goToStep(STEPS[stepIndex - 1]?.key ?? "details")}
              >
                Back
              </Button>
            )}
            {step !== "tests" ? (
              <Button
                type="button"
                disabled={submitting}
                onClick={() => goToStep(STEPS[stepIndex + 1]?.key ?? "tests")}
              >
                Next: {STEPS[stepIndex + 1]?.title}
              </Button>
            ) : (
              <>
                {/* HackerRank's "Save & Create Another", for the night an organizer types in a
                    whole round: the same save, then a blank form instead of the bank. */}
                {edit === undefined && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      submitting ||
                      !detailsComplete ||
                      !starterComplete ||
                      !testsComplete
                    }
                    onClick={() => void save(true)}
                  >
                    Create and add another
                  </Button>
                )}
                {/* Width held by the resting label (the wider of the pair in both modes), so
                    the save cannot resize the control mid-press; the keyed span rises the new
                    word in rather than flickering it. */}
                <Button
                  type="button"
                  className="relative whitespace-nowrap"
                  disabled={
                    submitting ||
                    !detailsComplete ||
                    !starterComplete ||
                    !testsComplete
                  }
                  onClick={() => void save(false)}
                >
                  <span aria-hidden="true" className="invisible">
                    {edit === undefined ? "Create question" : "Save changes"}
                  </span>
                  <span
                    key={submitting ? "busy" : "idle"}
                    className="motion-swap-in absolute inset-0 flex items-center justify-center"
                  >
                    {edit === undefined
                      ? submitting
                        ? "Creating..."
                        : "Create question"
                      : submitting
                        ? "Saving..."
                        : "Save changes"}
                  </span>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function BuilderHeader({
  step,
  title,
  description,
  action,
}: {
  step: number;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-rule-edge bg-ink/[0.025] px-5 py-5 sm:px-8">
      <div>
        <p
          className="font-semibold text-ink/60 uppercase"
          style={{ fontSize: "var(--text-xs)", letterSpacing: "0.1em" }}
        >
          Step {step} of {STEPS.length}
        </p>
        <h2
          className="mt-tight font-display font-bold leading-tight"
          style={{ fontSize: "var(--text-lg)" }}
        >
          {title}
        </h2>
        <p
          className="mt-tight max-w-[65ch] text-ink/70"
          style={{ fontSize: "var(--text-sm)" }}
        >
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}

function BuilderSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-panel border border-rule-edge">
      <header className="border-b border-rule-hair px-4 py-4 sm:px-6">
        <h3
          className="font-display font-bold"
          style={{ fontSize: "var(--text-md)" }}
        >
          {title}
        </h3>
        {description !== undefined && (
          <p
            className="mt-tight max-w-[70ch] text-ink/60"
            style={{ fontSize: "var(--text-xs)" }}
          >
            {description}
          </p>
        )}
      </header>
      <div className="flex flex-col gap-group p-4 sm:p-6">{children}</div>
    </section>
  );
}

function DetailsStep({
  title,
  setTitle,
  statementMd,
  setStatementMd,
  inputSpec,
  setInputSpec,
  outputSpec,
  setOutputSpec,
  constraints,
  setConstraints,
  designation,
  setDesignation,
  timeLimitMs,
  setTimeLimitMs,
  memoryLimitMb,
  setMemoryLimitMb,
  comparatorKind,
  setComparatorKind,
  epsilon,
  setEpsilon,
}: {
  title: string;
  setTitle: (value: string) => void;
  statementMd: string;
  setStatementMd: (value: string) => void;
  inputSpec: string;
  setInputSpec: (value: string) => void;
  outputSpec: string;
  setOutputSpec: (value: string) => void;
  constraints: string;
  setConstraints: (value: string) => void;
  designation: Designation;
  setDesignation: (value: Designation) => void;
  timeLimitMs: number;
  setTimeLimitMs: (value: number) => void;
  memoryLimitMb: number;
  setMemoryLimitMb: (value: number) => void;
  comparatorKind: "whitespace" | "exact" | "float";
  setComparatorKind: (value: "whitespace" | "exact" | "float") => void;
  epsilon: string;
  setEpsilon: (value: string) => void;
}) {
  /** Counts opens of the judge-settings disclosure; keying the body on it re-runs its entrance. */
  const [advancedOpens, setAdvancedOpens] = useState(0);

  return (
    <>
      <BuilderSection
        title="Problem"
        description="Start with the task, then the background and examples."
      >
        <TextInput
          label="Question name"
          required
          value={title}
          maxLength={120}
          placeholder="A Very Big Sum"
          onChange={(event) => setTitle(event.target.value)}
        />
        <TextArea
          label="Problem statement"
          required
          hint="Markdown is supported for headings, lists, links, code, and math."
          value={statementMd}
          rows={12}
          placeholder={
            "Explain the task and what the program needs to do."
          }
          onChange={(event) => setStatementMd(event.target.value)}
        />
      </BuilderSection>

      <BuilderSection
        title="Input and output"
        description="Keep format rules separate from the main statement so students can find them quickly."
      >
        <TextArea
          label="Input format"
          hint="Describe each line and the order of values. Optional."
          value={inputSpec}
          rows={5}
          onChange={(event) => setInputSpec(event.target.value)}
        />
        <TextArea
          label="Output format"
          hint="Describe exactly what the program should print. Optional."
          value={outputSpec}
          rows={5}
          onChange={(event) => setOutputSpec(event.target.value)}
        />
        <TextArea
          label="Constraints"
          hint="One rule per line works well. Example: 1 ≤ n ≤ 10^5. Optional."
          value={constraints}
          rows={4}
          onChange={(event) => setConstraints(event.target.value)}
        />
      </BuilderSection>

      <BuilderSection title="Question settings">
        <DifficultyPicker value={designation} onChange={setDesignation} />
        <p
          className="rounded-panel border border-rule-hair bg-ink/[0.025] p-4 text-ink/70"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Every supported language is available automatically.
        </p>

        {/*
          The judge's knobs, closed by default because the defaults are right for nearly every
          question: 2 seconds and 256 MB judge the whole current bank. Open it for the question
          that legitimately needs more, not to tune numbers that were never the problem.
        */}
        <details
          className="rounded-panel border border-rule-hair"
          onToggle={(event) => {
            if (event.currentTarget.open) setAdvancedOpens((n) => n + 1);
          }}
        >
          <summary
            className="cursor-pointer px-4 py-3 font-semibold"
            style={{ fontSize: "var(--text-sm)" }}
          >
            Advanced judge settings
          </summary>
          {/*
            The disclosure used to land its whole settings panel in the same frame as the click.
            `motion-panel-in` gives the arrival the panel rise; the `key` is what makes it run on
            EVERY open rather than only the first, because a closed details' children keep their
            boxes (content-visibility), so the keyframe otherwise plays to its end while hidden —
            globals.css withholds it while closed, and the remount restarts it per open. The
            limits survive the remount because their state lives in the builder.
          */}
          <div
            key={advancedOpens}
            className="motion-panel-in flex flex-col gap-group border-t border-rule-hair p-4"
          >
            <div className="grid gap-group sm:grid-cols-2">
              <TextInput
                label="Time limit (ms)"
                type="number"
                value={String(timeLimitMs)}
                hint="Per test, per language multipliers applied by the judge. Default 2000."
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (Number.isFinite(parsed)) setTimeLimitMs(Math.trunc(parsed));
                }}
              />
              <TextInput
                label="Memory limit (MB)"
                type="number"
                value={String(memoryLimitMb)}
                hint="Per test. Default 256."
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (Number.isFinite(parsed)) setMemoryLimitMb(Math.trunc(parsed));
                }}
              />
            </div>

            <fieldset>
              <legend
                className="mb-1 font-semibold"
                style={{ fontSize: "var(--text-sm)" }}
              >
                Output comparison
              </legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: "whitespace", label: "Standard text" },
                    { value: "exact", label: "Exact text" },
                    { value: "float", label: "Numeric tolerance" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setComparatorKind(option.value)}
                    aria-pressed={comparatorKind === option.value}
                    /* The press token on the repaint: the pressed state used to land in the
                       same frame as the click, which the eye cannot follow. Same grammar as
                       ui/Button, colours only. */
                    className={`rounded border px-4 py-1.5 font-semibold transition-[color,background-color,border-color] duration-[var(--motion-press)] ${
                      comparatorKind === option.value
                        ? "border-panther bg-panther text-paper"
                        : "border-rule-edge text-ink/75 hover:border-rule-firm"
                    }`}
                    style={{ fontSize: "var(--text-sm)" }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
                {comparatorKind === "whitespace"
                  ? "Standard: trailing spaces, trailing blank lines and line-ending differences are forgiven. Leading spaces still count, so drawing problems judge correctly."
                  : comparatorKind === "exact"
                    ? "Exact: every byte must match, including trailing whitespace. Choose this only when whitespace IS the answer."
                    : "Numeric: each number may differ from the expected value by the tolerance below."}
              </p>
              {comparatorKind === "float" && (
                <div className="mt-2 w-48">
                  <TextInput
                    label="Tolerance"
                    value={epsilon}
                    hint="Absolute. 0.000001 suits most floating-point answers."
                    onChange={(event) => setEpsilon(event.target.value)}
                  />
                </div>
              )}
            </fieldset>
          </div>
        </details>
      </BuilderSection>
    </>
  );
}

function StarterStep({
  signatureLocked,
  wantStarter,
  setWantStarter,
  fnName,
  setFnName,
  returns,
  setReturns,
  params,
  setParams,
  freshFrom,
}: {
  signatureLocked: boolean;
  wantStarter: boolean;
  setWantStarter: (value: boolean) => void;
  fnName: string;
  setFnName: (value: string) => void;
  returns: SignatureType;
  setReturns: (value: SignatureType) => void;
  params: DraftParam[];
  setParams: Dispatch<SetStateAction<DraftParam[]>>;
  /** Cards with an id past this line were added this session and get an entrance. */
  freshFrom: number;
}) {
  const signature = `${returns} ${fnName.trim() || "solve"}(${params
    .filter((param) => param.name.trim() !== "")
    .map((param) => `${param.type} ${param.name.trim()}`)
    .join(", ")})`;

  return (
    <BuilderSection
      title="Function declaration"
      description="Starter code lets students focus on the function instead of writing input parsing."
    >
      {signatureLocked ? (
        <div className="rounded-panel border border-rule-edge bg-ink/[0.025] p-4">
          <p className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
            This starter code is read only in the builder.
          </p>
          <p
            className="mt-tight max-w-[70ch] text-ink/70"
            style={{ fontSize: "var(--text-xs)" }}
          >
            Its input harness uses an advanced format. Saving this question
            keeps that harness unchanged. Create a new question if you need a
            different function signature.
          </p>
        </div>
      ) : (
        <label className="flex cursor-pointer items-start gap-3 rounded-panel border border-rule-edge bg-ink/[0.025] p-4">
          <input
            type="checkbox"
            checked={wantStarter}
            onChange={(event) => setWantStarter(event.target.checked)}
            className="mt-1 h-4 w-4 accent-panther"
          />
          <span>
            <span
              className="block font-semibold"
              style={{ fontSize: "var(--text-sm)" }}
            >
              Give students starter code
            </span>
            <span
              className="mt-1 block text-ink/60"
              style={{ fontSize: "var(--text-xs)" }}
            >
              Turn this off when students should read stdin and build the full
              program themselves.
            </span>
          </span>
        </label>
      )}

      {/* Checking the box lands a whole sub-form in one frame: a genuine surface arrival, so it
          rises in at the panel duration - its own comment already called it a surface, and the
          swap step it wore anyway is what read as "too fast" from the room. Unchecking just
          removes it. The wrapper div exists to give the fragment's contents one entrance
          instead of three. */}
      {!signatureLocked && wantStarter && (
        <div className="motion-panel-in flex flex-col gap-group">
          <div className="grid gap-group sm:grid-cols-2">
            <TextInput
              label="Function name"
              required
              value={fnName}
              hint="Use lowerCamelCase with letters and digits."
              onChange={(event) => setFnName(event.target.value)}
            />
            <TypeSelect
              label="Return type"
              value={returns}
              onChange={setReturns}
            />
          </div>

          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h4
                  className="font-semibold"
                  style={{ fontSize: "var(--text-sm)" }}
                >
                  Function parameters
                </h4>
                <p
                  className="mt-1 text-ink/60"
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  Parameters are read in this order. Arrays read their length
                  before their values.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setParams((current) => [
                    ...current,
                    { id: makeId(), name: "", type: "int" },
                  ])
                }
              >
                Add parameter
              </Button>
            </div>

            <div className="mt-tight flex flex-col gap-tight">
              {params.length === 0 ? (
                <p
                  className="border border-dashed border-rule-edge p-4 text-ink/60"
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  This function has no parameters.
                </p>
              ) : (
                params.map((param, index) => (
                  <div
                    key={param.id}
                    className={`rounded-panel border border-rule-hair p-4 ${
                      param.id > freshFrom ? "motion-swap-in" : ""
                    }`}
                  >
                    <div className="mb-tight flex items-center justify-between gap-3">
                      <span
                        className="font-semibold"
                        style={{ fontSize: "var(--text-xs)" }}
                      >
                        Parameter {index + 1}
                      </span>
                      <Button
                        type="button"
                        variant="quiet"
                        size="sm"
                        onClick={() =>
                          setParams((current) =>
                            current.filter((entry) => entry.id !== param.id),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid gap-group sm:grid-cols-2">
                      <TypeSelect
                        label="Type"
                        value={param.type}
                        onChange={(type) =>
                          setParams((current) =>
                            current.map((entry) =>
                              entry.id === param.id
                                ? { ...entry, type }
                                : entry,
                            ),
                          )
                        }
                      />
                      <TextInput
                        label="Parameter name"
                        value={param.name}
                        placeholder="value"
                        onChange={(event) =>
                          setParams((current) =>
                            current.map((entry) =>
                              entry.id === param.id
                                ? { ...entry, name: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border border-rule-edge bg-ink/[0.025] p-4">
            <p
              className="font-semibold text-ink/60 uppercase"
              style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}
            >
              Signature preview
            </p>
            <code
              className="numeric mt-tight block overflow-x-auto whitespace-nowrap"
              style={{ fontSize: "var(--text-sm)" }}
            >
              {signature}
            </code>
          </div>
        </div>
      )}
    </BuilderSection>
  );
}

function TestsStep({
  cases,
  setCases,
  sampleCount,
  freshFrom,
  referenceCode,
  setReferenceCode,
  referenceLanguage,
  setReferenceLanguage,
  referenceValidatedAt,
  timeLimitMs,
  memoryLimitMb,
  editSlug,
}: {
  cases: DraftCase[];
  setCases: Dispatch<SetStateAction<DraftCase[]>>;
  sampleCount: number;
  /** Cards with an id past this line were added this session and get an entrance. */
  freshFrom: number;
  referenceCode: string;
  setReferenceCode: (value: string) => void;
  referenceLanguage: LanguageId;
  setReferenceLanguage: (value: LanguageId) => void;
  /** The stored stamp, or null. Any save clears it server-side. */
  referenceValidatedAt: string | null;
  timeLimitMs: number;
  memoryLimitMb: number;
  /** Null while creating: Validate judges SAVED content, so it lives on the edit screen. */
  editSlug: string | null;
}) {
  const [generateBusy, setGenerateBusy] = useState(false);
  const [validateBusy, setValidateBusy] = useState(false);
  const [judgeNote, setJudgeNote] = useState<string | null>(null);
  const [validation, setValidation] = useState<{
    verdict: string;
    passed: number;
    total: number;
    validatedAt: string | null;
  } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  /*
    "Generate expected output": the reference is the oracle, and typing what a program would
    print by hand is the door wrong expectations walk in through. Runs every case's input
    through the reference in a real container and fills the expected outputs from what it
    printed. Overwrites only after the run, so a thrown request leaves the form untouched.
  */
  const generateOutputs = async (): Promise<void> => {
    setGenerateBusy(true);
    setJudgeNote(null);
    try {
      const response = await fetch(API_ROUTES.adminGenerateOutputs, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceSolution: referenceCode,
          referenceLanguage,
          timeLimitMs,
          memoryLimitMb,
          inputs: cases.map((entry) => entry.input),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setJudgeNote(errorMessageFromPayload(payload) ?? "The judge could not run the reference.");
        return;
      }
      const data =
        typeof payload === "object" && payload !== null && "data" in payload
          ? (payload as { data: { outputs: { ordinal: number; ran: boolean; verdict: string; stdout: string }[] } }).data
          : null;
      if (data === null) {
        setJudgeNote("The server returned an unexpected response.");
        return;
      }
      const failed = data.outputs.filter((output) => !output.ran);
      setCases((current) =>
        current.map((entry, index) => {
          const output = data.outputs.find((candidate) => candidate.ordinal === index + 1);
          return output !== undefined && output.ran
            ? { ...entry, expectedOutput: output.stdout }
            : entry;
        }),
      );
      setJudgeNote(
        failed.length === 0
          ? `Filled ${String(data.outputs.length)} expected output${data.outputs.length === 1 ? "" : "s"} from the reference.`
          : `Filled ${String(data.outputs.length - failed.length)}; the reference failed on case${failed.length === 1 ? "" : "s"} ${failed.map((output) => String(output.ordinal)).join(", ")} (${failed.map((output) => output.verdict).join(", ")}).`,
      );
    } catch {
      setJudgeNote("Could not reach the server.");
    } finally {
      setGenerateBusy(false);
    }
  };

  /*
    "Validate question": the reference against EVERY saved case, through the real judge.
    Validates what is STORED, which is why it lives on the edit screen: pressing it with
    unsaved edits would certify the wrong content, so the button says to save first.
  */
  const validateQuestion = async (): Promise<void> => {
    if (editSlug === null) return;
    setValidateBusy(true);
    setJudgeNote(null);
    setValidation(null);
    try {
      const response = await fetch(API_ROUTES.adminValidateProblem(editSlug), {
        method: "POST",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setJudgeNote(errorMessageFromPayload(payload) ?? "Validation could not run.");
        return;
      }
      const data =
        typeof payload === "object" && payload !== null && "data" in payload
          ? (payload as { data: { verdict: string; passed: number; total: number; validatedAt: string | null } }).data
          : null;
      if (data === null) {
        setJudgeNote("The server returned an unexpected response.");
        return;
      }
      setValidation(data);
    } catch {
      setJudgeNote("Could not reach the server.");
    } finally {
      setValidateBusy(false);
    }
  };

  /*
    Case files, the way most people already have them: NN.in with a matching NN.out. Every
    selected .in becomes a case paired by stem with its .out; a .in with no .out arrives with
    an empty expected output for Generate to fill. Appended, never replacing what is typed.
  */
  const uploadCases = async (files: FileList | null): Promise<void> => {
    if (files === null || files.length === 0) return;
    const byStem = new Map<string, { input?: string; output?: string }>();
    for (const file of Array.from(files)) {
      const match = /^(.*)\.(in|out|txt)$/i.exec(file.name);
      if (match === null) continue;
      const stem = match[1] ?? file.name;
      const kind = (match[2] ?? "").toLowerCase();
      const text = await file.text();
      const entry = byStem.get(stem) ?? {};
      if (kind === "out") entry.output = text;
      else entry.input = text;
      byStem.set(stem, entry);
    }
    const stems = [...byStem.keys()].sort();
    const additions: DraftCase[] = stems
      .map((stem) => byStem.get(stem))
      .filter((entry): entry is { input?: string; output?: string } => entry !== undefined)
      .filter((entry) => entry.input !== undefined || entry.output !== undefined)
      .map((entry) => ({
        id: makeId(),
        input: entry.input ?? "",
        expectedOutput: entry.output ?? "",
        isSample: false,
      }));
    if (additions.length > 0) setCases((current) => [...current, ...additions]);
    setJudgeNote(
      additions.length === 0
        ? "No .in/.out files found in that selection."
        : `Added ${String(additions.length)} case${additions.length === 1 ? "" : "s"} from files.`,
    );
    if (uploadRef.current !== null) uploadRef.current.value = "";
  };

  return (
    <BuilderSection
      title="Judge cases"
      description="Samples are visible to students. Hidden cases show only whether the submission passed."
    >
      <div className="flex flex-col gap-group">
        {cases.map((testCase, index) => (
          <section
            key={testCase.id}
            className={`overflow-hidden rounded-panel border border-rule-edge ${
              testCase.id > freshFrom ? "motion-swap-in" : ""
            }`}
          >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule-hair bg-ink/[0.025] px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  className="numeric flex h-7 w-7 items-center justify-center rounded-full border border-rule-firm"
                  style={{ fontSize: "var(--text-xs)" }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <div>
                  <h4
                    className="font-semibold"
                    style={{ fontSize: "var(--text-sm)" }}
                  >
                    Test case {index + 1}
                  </h4>
                  <span
                    className="text-ink/60"
                    style={{ fontSize: "var(--text-xs)" }}
                  >
                    {testCase.isSample ? "Sample case" : "Hidden case"}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label
                  className="flex cursor-pointer items-center gap-2"
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  <input
                    type="checkbox"
                    checked={testCase.isSample}
                    onChange={(event) =>
                      setCases((current) =>
                        current.map((entry) =>
                          entry.id === testCase.id
                            ? { ...entry, isSample: event.target.checked }
                            : entry,
                        ),
                      )
                    }
                    className="h-4 w-4 accent-panther"
                  />
                  Show to students
                </label>
                {cases.length > 1 && (
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    onClick={() =>
                      setCases((current) =>
                        current.filter((entry) => entry.id !== testCase.id),
                      )
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
            </header>
            <div className="grid gap-group p-4 sm:grid-cols-2 sm:p-5">
              <TextArea
                label="Input (stdin)"
                mono
                value={testCase.input}
                rows={6}
                placeholder="Input for this case"
                onChange={(event) =>
                  setCases((current) =>
                    current.map((entry) =>
                      entry.id === testCase.id
                        ? { ...entry, input: event.target.value }
                        : entry,
                    ),
                  )
                }
              />
              <TextArea
                label="Expected output (stdout)"
                mono
                required
                // HackerRank lets a case omit its output, and then "candidates see only their
                // own output". Our judge compares against this text, so the output is required;
                // the hint says WHY, and describes the DEFAULT comparison honestly: standard
                // text forgives trailing whitespace and line endings, and the sentence that
                // claimed "byte for byte" taught authors the wrong fear.
                hint="The judge compares output to this text, forgiving trailing spaces and line-ending differences (change that under Advanced judge settings). Samples show students the full diff. Hidden cases show pass or fail only."
                value={testCase.expectedOutput}
                rows={6}
                placeholder="Exact expected output"
                onChange={(event) =>
                  setCases((current) =>
                    current.map((entry) =>
                      entry.id === testCase.id
                        ? { ...entry, expectedOutput: event.target.value }
                        : entry,
                    ),
                  )
                }
              />
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule-hair pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setCases((current) => [
                ...current,
                { id: makeId(), input: "", expectedOutput: "", isSample: false },
              ])
            }
          >
            Add test case
          </Button>
          {/*
            Most authors already have cases as files. Pairs NN.in with NN.out by name; a .in
            with no .out arrives empty for Generate to fill. Appends, never replaces.
          */}
          <Button
            type="button"
            variant="quiet"
            onClick={() => uploadRef.current?.click()}
          >
            Upload case files
          </Button>
          <input
            ref={uploadRef}
            type="file"
            multiple
            accept=".in,.out,.txt"
            className="hidden"
            aria-label="Upload test case files"
            onChange={(event) => void uploadCases(event.target.files)}
          />
        </div>
        <p
          className={
            sampleCount === 0 ? "font-semibold text-panther" : "text-ink/60"
          }
          style={{ fontSize: "var(--text-xs)" }}
        >
          {cases.length} case{cases.length === 1 ? "" : "s"} · {sampleCount}{" "}
          sample
          {sampleCount === 1 ? "" : "s"}
          {sampleCount === 0 ? ". Mark at least one case as a sample." : ""}
        </p>
      </div>

      {/*
        The reference solution: recommended, private, and the only honest oracle. Everything
        below it exists to catch what reading cannot: expected outputs that are wrong, inputs
        the intended solution cannot parse, and limits it cannot meet.
      */}
      <div className="mt-group flex flex-col gap-group rounded-panel border border-rule-edge p-4 sm:p-5">
        <div>
          <h4 className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
            Reference solution
            <span className="ml-2 font-normal text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              Recommended
            </span>
          </h4>
          <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            Used privately to verify the cases and to generate expected outputs. Students never
            see it.
          </p>
        </div>

        <div className="w-56">
          <Select
            label="Language"
            value={referenceLanguage}
            onChange={(event) => setReferenceLanguage(event.target.value as LanguageId)}
          >
            {LANGUAGE_IDS.map((language) => (
              <option key={language} value={language}>
                {VARIANTS[language].label}
              </option>
            ))}
          </Select>
        </div>

        <TextArea
          label="Solution code"
          mono
          value={referenceCode}
          rows={10}
          placeholder="A correct program that reads stdin and prints the expected output."
          onChange={(event) => setReferenceCode(event.target.value)}
        />

        <div className="flex flex-wrap items-center gap-2">
          {/*
            Both buttons are sized by their WIDEST label (the Run/Submit pattern from
            ProblemWorkspace): the swap to the busy wording resized the control under the
            organizer's cursor mid-press. Measured at --text-sm semibold: "Generate expected
            outputs" 212px against 186px busy, but "Judging every case…" is 156px against
            "Validate question" at 135px - so the second button's width holder is its BUSY
            label, and eyeballing the resting one would have shipped the jump anyway. The keyed
            span makes each label swap a rise instead of a flicker.
          */}
          <Button
            type="button"
            variant="secondary"
            className="relative whitespace-nowrap"
            disabled={generateBusy || validateBusy || referenceCode.trim() === "" || cases.length === 0}
            onClick={() => void generateOutputs()}
          >
            <span aria-hidden="true" className="invisible">Generate expected outputs</span>
            <span
              key={generateBusy ? "busy" : "idle"}
              className="motion-swap-in absolute inset-0 flex items-center justify-center"
            >
              {generateBusy ? "Running the reference…" : "Generate expected outputs"}
            </span>
          </Button>
          {editSlug !== null && (
            <Button
              type="button"
              className="relative whitespace-nowrap"
              disabled={generateBusy || validateBusy}
              onClick={() => void validateQuestion()}
            >
              <span aria-hidden="true" className="invisible">Judging every case…</span>
              <span
                key={validateBusy ? "busy" : "idle"}
                className="motion-swap-in absolute inset-0 flex items-center justify-center"
              >
                {validateBusy ? "Judging every case…" : "Validate question"}
              </span>
            </Button>
          )}
          {editSlug === null && (
            <span className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              Save first, then Validate question judges the saved reference against every case.
            </span>
          )}
        </div>

        {/* The stored stamp describes SAVED content; a save clears it server-side. */}
        {validation === null && referenceValidatedAt !== null && (
          <p className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
            <span className="font-semibold">Validated.</span> The saved reference passed every
            case. Editing anything clears this until the next validation.
          </p>
        )}

        {validation !== null && (
          <p
            role="status"
            className={`motion-swap-in font-semibold ${
              validation.validatedAt !== null ? "" : "text-panther"
            }`}
            style={{ fontSize: "var(--text-sm)" }}
          >
            {validation.validatedAt !== null
              ? `Validated: all ${String(validation.total)} cases pass through the real judge.`
              : `Validation failed: ${String(validation.passed)} of ${String(validation.total)} cases pass (${validation.verdict}). Fix the reference or the cases and run it again.`}
          </p>
        )}

        {judgeNote !== null && (
          <p role="status" className="motion-swap-in text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
            {judgeNote}
          </p>
        )}
      </div>
    </BuilderSection>
  );
}

/** The envelope's error message, if the payload carries one this form can show. */
function errorMessageFromPayload(payload: unknown): string | null {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const message = (payload as { error: { message?: string } }).error.message;
    return typeof message === "string" ? message : null;
  }
  return null;
}

function QualityReview({
  detailsComplete,
  starterComplete,
  expectedOutputsComplete,
  caseCount,
  sampleCount,
  formatsComplete,
  constraintsComplete,
  referenceProvided,
  validated,
}: {
  detailsComplete: boolean;
  starterComplete: boolean;
  expectedOutputsComplete: boolean;
  caseCount: number;
  sampleCount: number;
  formatsComplete: boolean;
  constraintsComplete: boolean;
  referenceProvided: boolean;
  validated: boolean;
}) {
  /*
    Two lists, and the boundary between them is the point: "Required" is what the save itself
    refuses without, so it can never read as advice; "Recommended" is what a good question has
    and a legal one may lack. Mixing them taught authors that everything on the list was equally
    optional, which is exactly backwards for the top half.
  */
  return (
    <aside
      className="rounded-panel border border-rule-edge bg-paper p-4"
      aria-label="Question quality review"
    >
      <h2
        className="font-display font-bold"
        style={{ fontSize: "var(--text-sm)" }}
      >
        Quality review
      </h2>
      <h3
        className="mt-tight font-semibold uppercase tracking-wide text-ink/60"
        style={{ fontSize: "var(--text-xs)" }}
      >
        Required to save
      </h3>
      <ul className="mt-1 flex flex-col gap-tight">
        <ReviewItem ok={detailsComplete}>Title and statement</ReviewItem>
        <ReviewItem ok={caseCount >= 1}>At least one test case</ReviewItem>
        <ReviewItem ok={expectedOutputsComplete}>
          Expected output for every case
        </ReviewItem>
        <ReviewItem ok={sampleCount > 0}>At least one sample case</ReviewItem>
      </ul>
      <h3
        className="mt-group font-semibold uppercase tracking-wide text-ink/60"
        style={{ fontSize: "var(--text-xs)" }}
      >
        Recommended
      </h3>
      <ul className="mt-1 flex flex-col gap-tight">
        <ReviewItem ok={formatsComplete} recommendation>
          Input and output formats
        </ReviewItem>
        <ReviewItem ok={constraintsComplete} recommendation>
          Constraints
        </ReviewItem>
        <ReviewItem ok={sampleCount >= 2} recommendation>
          Two sample cases
        </ReviewItem>
        <ReviewItem ok={caseCount >= 3} recommendation>
          Three or more test cases
        </ReviewItem>
        <ReviewItem ok={starterComplete} recommendation>
          Starter code ready
        </ReviewItem>
        <ReviewItem ok={referenceProvided} recommendation>
          Reference solution
        </ReviewItem>
        <ReviewItem ok={validated} recommendation>
          Judge validation passed
        </ReviewItem>
      </ul>
    </aside>
  );
}

function ReviewItem({
  ok,
  recommendation = false,
  children,
}: {
  ok: boolean;
  recommendation?: boolean;
  children: ReactNode;
}) {
  return (
    <li
      className="flex items-start gap-2 text-ink/70"
      style={{ fontSize: "var(--text-xs)" }}
    >
      <span className="numeric font-bold text-ink" aria-hidden="true">
        {ok ? "✓" : "○"}
      </span>
      <span>
        {children}
        {recommendation && (
          <span className="block text-ink/60">Recommended</span>
        )}
      </span>
      <span className="sr-only">
        {ok ? "Complete" : recommendation ? "Recommended" : "Incomplete"}
      </span>
    </li>
  );
}

interface PreviewProps {
  title: string;
  statementMd: string;
  inputSpec: string;
  outputSpec: string;
  constraints: string;
  cases: readonly DraftCase[];
  starter: PreviewStarter;
}

function PreviewButton(props: PreviewProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      {/* HackerRank's "See candidate preview"; ours says student because that is who sits the
          contest, and it is the word every other sentence on this surface already uses. */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        See student preview
      </Button>
      {/*
        `motion-panel-in` on a `<dialog>` runs from globals.css's `dialog.motion-panel-in[open]`
        rule — the top layer needs the keyframe on the [open] state, so both open paths (first
        open and re-open) start it fresh. The panel TRANSLATES only, never fades: its header is
        `bg-ink` with `text-paper/70` inside, and any wrapper opacity would carry that text below
        its contrast floor mid-animation. The ::backdrop may fade because it holds no text, and
        the reduced-motion flattening reaches both (globals.css names `*::backdrop` explicitly).
        Close stays instant: `close()` removes it from the top layer the same frame, and a
        control returning to rest should just return.
      */}
      <dialog
        ref={dialogRef}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        className="motion-panel-in max-h-[calc(100vh-2rem)] w-[min(64rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-panel border border-rule-edge bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/65"
        aria-labelledby="question-preview-title"
      >
        <header className="flex items-center justify-between gap-4 border-b border-rule-edge bg-ink px-5 py-4 text-paper">
          <div>
            <p
              className="text-paper/70 uppercase"
              style={{ fontSize: "var(--text-xs)", letterSpacing: "0.1em" }}
            >
              Student view
            </p>
            <h2
              id="question-preview-title"
              className="font-display font-bold"
              style={{ fontSize: "var(--text-md)" }}
            >
              Question preview
            </h2>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setOpen(false)}
            autoFocus
          >
            Close preview
          </Button>
        </header>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto p-5 sm:p-8">
          <ProblemPreview {...props} />
        </div>
      </dialog>
    </>
  );
}

function ProblemPreview({
  title,
  statementMd,
  inputSpec,
  outputSpec,
  constraints,
  cases,
  starter,
}: PreviewProps) {
  const samples = cases.filter((testCase) => testCase.isSample);

  return (
    <article className="mx-auto max-w-[75ch]">
      <h3
        className="font-display font-bold leading-tight"
        style={{ fontSize: "var(--text-xl)" }}
      >
        {title.trim() || "Untitled question"}
      </h3>
      <div className="mt-group">
        {statementMd.trim() === "" ? (
          <p className="text-ink/50">The problem statement will appear here.</p>
        ) : (
          <Markdown source={statementMd} />
        )}
      </div>
      <PreviewSection title="Input format" source={inputSpec} />
      <PreviewSection title="Output format" source={outputSpec} />
      <PreviewSection title="Constraints" source={constraints} mono />

      <section className="mt-section">
        <h4
          className="font-display font-bold"
          style={{ fontSize: "var(--text-lg)" }}
        >
          Samples
        </h4>
        {samples.length === 0 ? (
          <p
            className="mt-tight text-ink/50"
            style={{ fontSize: "var(--text-sm)" }}
          >
            Mark a test case as a sample to show it here.
          </p>
        ) : (
          <div className="mt-group flex flex-col gap-group">
            {samples.map((sample, index) => (
              <div
                key={sample.id}
                className="overflow-hidden rounded-panel border border-rule-edge"
              >
                <h5
                  className="border-b border-rule-hair bg-ink/[0.025] px-4 py-3 font-semibold"
                  style={{ fontSize: "var(--text-sm)" }}
                >
                  Sample {index + 1}
                </h5>
                <div className="grid sm:grid-cols-2">
                  <PreviewCode label="Input" value={sample.input} />
                  <PreviewCode
                    label="Expected output"
                    value={sample.expectedOutput}
                    bordered
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <StarterPreview starter={starter} />
    </article>
  );
}

/**
 * The starter code exactly as it will land in the student's editor, generated by the SAME
 * emitters (`lib/judge/starters/`) the save will run. Before this existed the first time an
 * organizer saw the generated stub was on the saved question's page, after the fact.
 */
function StarterPreview({ starter }: { starter: PreviewStarter }) {
  const [language, setLanguage] = useState<LanguageId>("PYTHON_312");

  const code = useMemo(() => {
    if (starter.kind !== "ready") return null;
    try {
      return starterFor(starter.signature, language);
    } catch {
      // An emitter refusing a schema-valid signature is the server's save-time check firing
      // early; the preview says "not valid yet" rather than rendering a stub the save would not.
      return null;
    }
  }, [starter, language]);

  return (
    <section className="mt-section">
      <h4
        className="font-display font-bold"
        style={{ fontSize: "var(--text-lg)" }}
      >
        Starter code
      </h4>
      {starter.kind === "off" ? (
        <p
          className="mt-tight text-ink/50"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Starter code is off. Students begin with an empty editor and read
          stdin themselves.
        </p>
      ) : starter.kind === "locked" ? (
        <p
          className="mt-tight text-ink/50"
          style={{ fontSize: "var(--text-sm)" }}
        >
          This question keeps its stored starter code. Open the question page
          to see it. The builder cannot edit its advanced harness.
        </p>
      ) : starter.kind === "invalid" || code === null ? (
        <p
          className="mt-tight text-ink/50"
          style={{ fontSize: "var(--text-sm)" }}
        >
          The starter code signature is not valid yet. Name the function and
          every parameter on the Starter code step to preview the generated
          file.
        </p>
      ) : (
        <div className="mt-group flex flex-col gap-group">
          {/*
            A pressed-button row, not `components/ui/Select`: that Select portals its listbox to
            `<body>`, and this preview is a `<dialog>` in the top layer, which paints over and
            blocks clicks to everything portalled beneath it. Ten labels also compare better in
            a row than behind a dropdown when the question is "does each language's stub read
            right".
          */}
          <fieldset>
            <legend
              className="mb-1 font-semibold"
              style={{ fontSize: "var(--text-sm)" }}
            >
              Language
            </legend>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLanguage(id)}
                  aria-pressed={language === id}
                  /* Press-token repaint, as on the comparator and difficulty chips. */
                  className={`rounded border px-3 py-1.5 font-semibold transition-[color,background-color,border-color] duration-[var(--motion-press)] ${
                    language === id
                      ? "border-panther bg-panther text-paper"
                      : "border-rule-edge text-ink/75 hover:border-rule-firm"
                  }`}
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  {VARIANTS[id].label}
                </button>
              ))}
            </div>
          </fieldset>
          {/* Keyed by language: each stub swap is content replacing content and re-runs the
              rise, which is what makes ten near-identical stubs comparable by click. */}
          <pre
            key={language}
            className="motion-swap-in numeric overflow-x-auto rounded-panel border border-rule-edge bg-ink/[0.035] p-4"
            style={{ fontSize: "var(--text-xs)", lineHeight: "1.6" }}
          >
            {code}
          </pre>
        </div>
      )}
    </section>
  );
}

function PreviewSection({
  title,
  source,
  mono = false,
}: {
  title: string;
  source: string;
  mono?: boolean;
}) {
  if (source.trim() === "") return null;
  return (
    <section className="mt-section">
      <h4
        className="font-display font-bold"
        style={{ fontSize: "var(--text-lg)" }}
      >
        {title}
      </h4>
      <div
        className={`mt-tight ${mono ? "numeric whitespace-pre-wrap" : ""}`}
        style={{ fontSize: "var(--text-sm)" }}
      >
        {mono ? source : <Markdown source={source} />}
      </div>
    </section>
  );
}

function PreviewCode({
  label,
  value,
  bordered = false,
}: {
  label: string;
  value: string;
  bordered?: boolean;
}) {
  return (
    <div
      className={`min-w-0 p-4 ${bordered ? "border-t border-rule-hair sm:border-t-0 sm:border-l" : ""}`}
    >
      <h6
        className="font-semibold text-ink/60 uppercase"
        style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}
      >
        {label}
      </h6>
      <pre
        className="numeric mt-tight overflow-x-auto whitespace-pre-wrap bg-ink/[0.035] p-3"
        style={{ fontSize: "var(--text-sm)" }}
      >
        {value === ""
          ? label === "Input"
            ? "(no input)"
            : "(not provided)"
          : value}
      </pre>
    </div>
  );
}

function DifficultyPicker({
  value,
  onChange,
}: {
  value: Designation;
  onChange: (value: Designation) => void;
}) {
  const options: readonly { value: Designation; label: string }[] = [
    { value: "E", label: "Easy" },
    { value: "M", label: "Medium" },
    { value: "H", label: "Hard" },
    // The fourth designation, from the past-contest spreadsheets: a team question is worked by
    // the whole team at once and lands in the line-up's group slot by default.
    { value: "TEAM", label: "Team" },
  ];
  return (
    <fieldset>
      <legend
        className="mb-1 font-semibold"
        style={{ fontSize: "var(--text-sm)" }}
      >
        Difficulty
      </legend>
      <div className="flex gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            /* Press-token repaint, as on the comparator chips. */
            className={`rounded border px-4 py-1.5 font-semibold transition-[color,background-color,border-color] duration-[var(--motion-press)] ${
              value === option.value
                ? "border-panther bg-panther text-paper"
                : "border-rule-edge text-ink/75 hover:border-rule-firm"
            }`}
            style={{ fontSize: "var(--text-sm)" }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function TypeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SignatureType;
  onChange: (value: SignatureType) => void;
}) {
  return (
    <Select
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as SignatureType)}
    >
      {SIGNATURE_TYPES.map((type) => (
        <option key={type} value={type}>
          {type}
        </option>
      ))}
    </Select>
  );
}
