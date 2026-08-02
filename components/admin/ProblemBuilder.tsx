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
  readonly difficulty: "E" | "M" | "H";
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

export function ProblemBuilder({ edit }: ProblemBuilderProps = {}) {
  const router = useRouter();
  const initial = edit?.initial;
  const [step, setStep] = useState<StepKey>("details");

  // --- details ---
  const [title, setTitle] = useState(initial?.title ?? "");
  const [statementMd, setStatementMd] = useState(initial?.statementMd ?? "");
  const [inputSpec, setInputSpec] = useState(initial?.inputSpec ?? "");
  const [outputSpec, setOutputSpec] = useState(initial?.outputSpec ?? "");
  const [constraints, setConstraints] = useState(initial?.constraints ?? "");
  const [difficulty, setDifficulty] = useState<"E" | "M" | "H">(
    initial?.difficulty ?? "E",
  );

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
  const starterComplete =
    signatureLocked || !wantStarter || fnName.trim() !== "";
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
        difficulty,
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
        setDifficulty("E");
        setWantStarter(false);
        setFnName("solve");
        setReturns("int");
        setParams([{ id: makeId(), name: "n", type: "int" }]);
        setCases([{ id: makeId(), input: "", expectedOutput: "", isSample: true }]);
        setStep("details");
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
    difficulty,
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
              const done =
                (entry.key === "details" && detailsComplete) ||
                (entry.key === "starter" && starterComplete) ||
                (entry.key === "tests" && testsComplete);

              return (
                <li key={entry.key} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    onClick={() => setStep(entry.key)}
                    aria-current={active ? "step" : undefined}
                    className={`flex w-full items-center gap-3 border-l-2 px-3 py-3 text-left transition-colors ${
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
            starterComplete={starterComplete}
            expectedOutputsComplete={cases.every(
              (testCase) => testCase.expectedOutput.trim() !== "",
            )}
            caseCount={cases.length}
            sampleCount={sampleCount}
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

        <div className="flex flex-col gap-group p-5 sm:p-8">
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
              difficulty={difficulty}
              setDifficulty={setDifficulty}
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
            />
          )}

          {step === "tests" && (
            <TestsStep
              cases={cases}
              setCases={setCases}
              sampleCount={sampleCount}
            />
          )}
        </div>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-rule-edge bg-paper/95 px-5 py-4 backdrop-blur sm:px-8">
          {error !== null ? (
            <p
              role="alert"
              className="font-semibold text-panther"
              style={{ fontSize: "var(--text-sm)" }}
            >
              {error}
            </p>
          ) : created !== null ? (
            <p
              role="status"
              className="font-semibold"
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
                onClick={() => setStep(STEPS[stepIndex - 1]?.key ?? "details")}
              >
                Back
              </Button>
            )}
            {step !== "tests" ? (
              <Button
                type="button"
                disabled={submitting}
                onClick={() => setStep(STEPS[stepIndex + 1]?.key ?? "tests")}
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
                <Button
                  type="button"
                  disabled={
                    submitting ||
                    !detailsComplete ||
                    !starterComplete ||
                    !testsComplete
                  }
                  onClick={() => void save(false)}
                >
                  {edit === undefined
                    ? submitting
                      ? "Creating..."
                      : "Create question"
                    : submitting
                      ? "Saving..."
                      : "Save changes"}
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
  difficulty,
  setDifficulty,
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
  difficulty: "E" | "M" | "H";
  setDifficulty: (value: "E" | "M" | "H") => void;
}) {
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
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        <p
          className="rounded-panel border border-rule-hair bg-ink/[0.025] p-4 text-ink/70"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Every supported language is available automatically.
        </p>
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

      {!signatureLocked && wantStarter && (
        <>
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
                    className="rounded-panel border border-rule-hair p-4"
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
        </>
      )}
    </BuilderSection>
  );
}

function TestsStep({
  cases,
  setCases,
  sampleCount,
}: {
  cases: DraftCase[];
  setCases: Dispatch<SetStateAction<DraftCase[]>>;
  sampleCount: number;
}) {
  return (
    <BuilderSection
      title="Judge cases"
      description="Samples are visible to students. Hidden cases show only whether the submission passed."
    >
      <div className="flex flex-col gap-group">
        {cases.map((testCase, index) => (
          <section
            key={testCase.id}
            className="overflow-hidden rounded-panel border border-rule-edge"
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
                // own output". Our judge compares byte for byte, so the output is required; the
                // hint says WHY rather than leaving "required" to read as arbitrary.
                hint="The judge compares the program's output to this text byte for byte, so every case needs one. Samples show students the full diff. Hidden cases show pass or fail only."
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
    </BuilderSection>
  );
}

function QualityReview({
  detailsComplete,
  starterComplete,
  expectedOutputsComplete,
  caseCount,
  sampleCount,
}: {
  detailsComplete: boolean;
  starterComplete: boolean;
  expectedOutputsComplete: boolean;
  caseCount: number;
  sampleCount: number;
}) {
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
      <ul className="mt-tight flex flex-col gap-tight">
        <ReviewItem ok={detailsComplete}>Title and statement</ReviewItem>
        <ReviewItem ok={starterComplete}>Starter code ready</ReviewItem>
        <ReviewItem ok={expectedOutputsComplete}>
          Expected output for every case
        </ReviewItem>
        <ReviewItem ok={sampleCount > 0}>At least one sample case</ReviewItem>
        <ReviewItem ok={caseCount >= 3} recommendation>
          Three or more test cases
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
      <dialog
        ref={dialogRef}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        className="max-h-[calc(100vh-2rem)] w-[min(64rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-panel border border-rule-edge bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/65"
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
                  className={`rounded border px-3 py-1.5 font-semibold ${
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
          <pre
            className="numeric overflow-x-auto rounded-panel border border-rule-edge bg-ink/[0.035] p-4"
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
  value: "E" | "M" | "H";
  onChange: (value: "E" | "M" | "H") => void;
}) {
  const options: readonly { value: "E" | "M" | "H"; label: string }[] = [
    { value: "E", label: "Easy" },
    { value: "M", label: "Medium" },
    { value: "H", label: "Hard" },
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
            className={`rounded border px-4 py-1.5 font-semibold ${
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
