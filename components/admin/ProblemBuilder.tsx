"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { TextArea, TextInput } from "@/components/admin/Field";
import { AlertPlate } from "@/components/admin/Panel";
import { Button } from "@/components/ui";
import {
  API_ROUTES,
  CreateProblemResponseSchema,
  type CreateProblemRequest,
} from "@/lib/schemas/api";

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

const SIGNATURE_TYPES = ["int", "long", "string", "int[]", "long[]", "string[]"] as const;
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

const STEPS: readonly { key: StepKey; title: string; blurb: string }[] = [
  { key: "details", title: "Question details", blurb: "Title, statement, difficulty" },
  { key: "starter", title: "Starter code", blurb: "Optional function stub" },
  { key: "tests", title: "Test cases", blurb: "Input and expected output" },
];

let nextId = 1;
const makeId = (): number => (nextId += 1);

/** The starter-code signature in the flat form this builder collects, as it comes back for an edit. */
export interface ProblemBuilderSignature {
  readonly name: string;
  readonly returns: SignatureType;
  readonly params: readonly { readonly name: string; readonly type: SignatureType }[];
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
  /**
   * Judged submissions that already exist against this question. Not a blocker: a live contest is
   * refused by the server, and what is left is a past contest or a draft. It is worth saying out
   * loud, because changing test data changes what those verdicts meant.
   */
  readonly judgedSubmissionCount: number;
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
  const [difficulty, setDifficulty] = useState<"E" | "M" | "H">(initial?.difficulty ?? "E");

  // --- starter code ---
  // A question whose stored signature this form cannot represent keeps it: the checkbox is not
  // rendered at all, and `signature` is left out of the PATCH entirely.
  const signatureLocked = initial !== undefined && !initial.signatureEditable;
  const [wantStarter, setWantStarter] = useState(initial?.signature != null);
  const [fnName, setFnName] = useState(initial?.signature?.name ?? "solve");
  const [returns, setReturns] = useState<SignatureType>(initial?.signature?.returns ?? "int");
  const [params, setParams] = useState<DraftParam[]>(() =>
    initial?.signature != null && initial.signature.params.length > 0
      ? initial.signature.params.map((p) => ({ id: makeId(), name: p.name, type: p.type }))
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

  const sampleCount = useMemo(() => cases.filter((c) => c.isSample).length, [cases]);

  const detailsComplete = title.trim() !== "" && statementMd.trim() !== "";
  const testsComplete =
    cases.length > 0 && sampleCount > 0 && cases.every((c) => c.expectedOutput.trim() !== "");

  const save = useCallback(async () => {
    setSubmitting(true);
    setError(null);
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
      const body: CreateProblemRequest = signatureLocked ? common : { ...common, signature };

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
      // A create lands on the bank, where the new question is now listed and cleared for a
      // contest. An edit lands on the question itself, whose preview shows what it now says.
      router.push(edit === undefined ? "/admin/problems" : `/admin/problems/${parsed.data.slug}`);
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
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      {/* --- what an edit is about to reinterpret -------------------------- */}
      {edit !== undefined && edit.judgedSubmissionCount > 0 && (
        // Spans both columns rather than sitting in the form, because it is a fact about the
        // question and not about any one step. `live` is false: it is a standing condition present
        // at first render, and a live region here would announce it on every arrival.
        <div className="lg:col-span-2">
          <AlertPlate tone="notice" title="This question has already been judged" live={false}>
            <p>
              {edit.judgedSubmissionCount} submission
              {edit.judgedSubmissionCount === 1 ? " has" : "s have"} been judged against this
              question. Changing the test data does not change those verdicts, but it does change
              what they meant: a stored <strong>AC</strong> was earned against cases that will no
              longer exist. Editing the statement or the limits is safe. Editing the cases is a
              decision about a result somebody already has.
            </p>
          </AlertPlate>
        </div>
      )}

      {/* --- step rail ---------------------------------------------------- */}
      <nav aria-label="Question sections" className="lg:sticky lg:top-4 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {STEPS.map((entry, index) => {
            const active = step === entry.key;
            const done =
              (entry.key === "details" && detailsComplete) ||
              (entry.key === "tests" && testsComplete) ||
              (entry.key === "starter" && wantStarter && fnName.trim() !== "");
            return (
              <li key={entry.key} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => setStep(entry.key)}
                  aria-current={active ? "step" : undefined}
                  className={`flex w-full items-center gap-3 rounded border px-3 py-2 text-left ${
                    active
                      ? "border-panther bg-panther/[0.06]"
                      : "border-rule-edge hover:border-rule-firm"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      done ? "bg-ink text-paper" : "border border-rule-firm text-ink/70"
                    }`}
                    style={{ fontSize: "var(--text-xs)" }}
                  >
                    {done ? "✓" : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold" style={{ fontSize: "var(--text-sm)" }}>
                      {entry.title}
                    </span>
                    <span className="block text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
                      {entry.blurb}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* --- panel -------------------------------------------------------- */}
      <div className="min-w-0 rounded border border-rule-edge bg-paper p-5">
        {step === "details" && (
          <div className="flex flex-col gap-4">
            <SectionHeading title="Question details" />
            <TextInput
              label="Question name"
              required
              value={title}
              maxLength={120}
              placeholder="A Very Big Sum"
              onChange={(e) => setTitle(e.target.value)}
            />
            <TextArea
              label="Problem statement"
              required
              hint="Markdown. Write your own; do not paste from another site."
              value={statementMd}
              rows={10}
              placeholder={"# Title\n\nDescribe the task, then the input and output."}
              onChange={(e) => setStatementMd(e.target.value)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextArea
                label="Input format"
                hint="Optional."
                value={inputSpec}
                rows={3}
                onChange={(e) => setInputSpec(e.target.value)}
              />
              <TextArea
                label="Output format"
                hint="Optional."
                value={outputSpec}
                rows={3}
                onChange={(e) => setOutputSpec(e.target.value)}
              />
            </div>
            <TextArea
              label="Constraints"
              hint="Optional. e.g. 1 ≤ n ≤ 10^5"
              value={constraints}
              rows={2}
              onChange={(e) => setConstraints(e.target.value)}
            />
            <DifficultyPicker value={difficulty} onChange={setDifficulty} />
            <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              Every question runs in all six languages. There is nothing to choose here, which is
              why there is no languages step.
            </p>
          </div>
        )}

        {step === "starter" && (
          <div className="flex flex-col gap-4">
            <SectionHeading title="Starter code" />
            <p className="max-w-[62ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
              Optional. Pre-fill the editor with a function the student completes, so they never
              write input parsing. The same stub is generated for every language. Leave this off
              and the student gets a blank editor and reads stdin themselves.
            </p>

            {signatureLocked ? (
              <p
                className="max-w-[62ch] border-l-2 border-panther pl-4"
                style={{ fontSize: "var(--text-sm)" }}
              >
                <strong>This question&rsquo;s starter code is kept as it is, and is not editable
                here.</strong>{" "}
                Its signature uses parts of the harness format this form does not offer: fields read
                once before a repeat loop, or a count field named by hand. Flattening that into a
                function name and a parameter list would change how every student&rsquo;s stub reads
                its input, without saying so. Saving leaves it untouched. To change it, edit the
                question&rsquo;s <code>problem.json</code> in the repository.
              </p>
            ) : (
              <label className="flex items-center gap-2" style={{ fontSize: "var(--text-sm)" }}>
                <input
                  type="checkbox"
                  checked={wantStarter}
                  onChange={(e) => setWantStarter(e.target.checked)}
                  className="h-4 w-4 accent-panther"
                />
                Give this question starter code
              </label>
            )}

            {!signatureLocked && wantStarter && (
              <div className="flex flex-col gap-4 border-l-2 border-rule-edge pl-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput
                    label="Function name"
                    required
                    value={fnName}
                    hint="lowerCamelCase, letters and digits only."
                    onChange={(e) => setFnName(e.target.value)}
                  />
                  <TypeSelect label="Returns" value={returns} onChange={setReturns} />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
                    Parameters
                  </span>
                  <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
                    Read in this order. An array parameter reads its length first, then the values,
                    so match your test-case input to that order.
                  </p>
                  {params.map((param) => (
                    <div key={param.id} className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[8rem] flex-1">
                        <TextInput
                          label="Name"
                          value={param.name}
                          onChange={(e) =>
                            setParams((prev) =>
                              prev.map((p) => (p.id === param.id ? { ...p, name: e.target.value } : p)),
                            )
                          }
                        />
                      </div>
                      <div className="min-w-[7rem]">
                        <TypeSelect
                          label="Type"
                          value={param.type}
                          onChange={(type) =>
                            setParams((prev) => prev.map((p) => (p.id === param.id ? { ...p, type } : p)))
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="quiet"
                        size="sm"
                        onClick={() => setParams((prev) => prev.filter((p) => p.id !== param.id))}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setParams((prev) => [...prev, { id: makeId(), name: "", type: "int" }])
                      }
                    >
                      Add a parameter
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "tests" && (
          <div className="flex flex-col gap-4">
            <SectionHeading title="Test cases" />
            <p className="max-w-[62ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
              A test case is input fed to the program on stdin and the exact output expected on
              stdout. Mark the ones a student may see in full as samples; the rest are hidden and
              reveal only pass or fail. HackerRank recommends three to fifteen.
            </p>

            {cases.map((testCase, index) => (
              <div key={testCase.id} className="rounded border border-rule-edge p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
                    Test case {index + 1}
                  </span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2" style={{ fontSize: "var(--text-xs)" }}>
                      <input
                        type="checkbox"
                        checked={testCase.isSample}
                        onChange={(e) =>
                          setCases((prev) =>
                            prev.map((c) =>
                              c.id === testCase.id ? { ...c, isSample: e.target.checked } : c,
                            ),
                          )
                        }
                        className="h-4 w-4 accent-panther"
                      />
                      Sample (shown to students)
                    </label>
                    {cases.length > 1 && (
                      <Button
                        type="button"
                        variant="quiet"
                        size="sm"
                        onClick={() => setCases((prev) => prev.filter((c) => c.id !== testCase.id))}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextArea
                    label="Input (stdin)"
                    mono
                    value={testCase.input}
                    rows={4}
                    onChange={(e) =>
                      setCases((prev) =>
                        prev.map((c) => (c.id === testCase.id ? { ...c, input: e.target.value } : c)),
                      )
                    }
                  />
                  <TextArea
                    label="Expected output (stdout)"
                    mono
                    required
                    value={testCase.expectedOutput}
                    rows={4}
                    onChange={(e) =>
                      setCases((prev) =>
                        prev.map((c) =>
                          c.id === testCase.id ? { ...c, expectedOutput: e.target.value } : c,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setCases((prev) => [
                    ...prev,
                    { id: makeId(), input: "", expectedOutput: "", isSample: false },
                  ])
                }
              >
                Add a test case
              </Button>
              <span
                className={sampleCount === 0 ? "text-panther" : "text-ink/60"}
                style={{ fontSize: "var(--text-xs)" }}
              >
                {cases.length} case{cases.length === 1 ? "" : "s"}, {sampleCount} sample
                {sampleCount === 1 ? "" : "s"}
                {sampleCount === 0 ? " (mark at least one as a sample)" : ""}
              </span>
            </div>
          </div>
        )}

        {/* --- footer ---------------------------------------------------- */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-rule-edge pt-4">
          {error !== null ? (
            <p role="alert" className="text-panther" style={{ fontSize: "var(--text-sm)" }}>
              {error}
            </p>
          ) : (
            <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              {detailsComplete
                ? testsComplete
                  ? edit === undefined
                    ? "Ready to create."
                    : "Ready to save."
                  : "Add a statement and at least one sample test case."
                : "A title and a statement are required."}
            </p>
          )}
          <div className="flex items-center gap-2">
            {edit !== undefined && (
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => router.push(`/admin/problems/${edit.slug}`)}
              >
                Cancel
              </Button>
            )}
            {step !== "tests" && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep(step === "details" ? "starter" : "tests")}
              >
                Next
              </Button>
            )}
            <Button
              type="button"
              disabled={submitting || !detailsComplete || !testsComplete}
              onClick={() => void save()}
            >
              {edit === undefined
                ? submitting
                  ? "Creating…"
                  : "Create question"
                : submitting
                  ? "Saving…"
                  : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
      {title}
    </h2>
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
      <legend className="mb-1 font-semibold" style={{ fontSize: "var(--text-sm)" }}>
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
    <label className="flex flex-col gap-1" style={{ fontSize: "var(--text-sm)" }}>
      <span className="font-semibold">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SignatureType)}
        className="numeric rounded border border-ink/25 bg-paper px-3 py-2"
        style={{ fontSize: "var(--text-sm)" }}
      >
        {SIGNATURE_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
    </label>
  );
}
