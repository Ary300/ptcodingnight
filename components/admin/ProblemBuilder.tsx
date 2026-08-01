"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { TextArea, TextInput } from "@/components/admin/Field";
import { Button } from "@/components/ui";
import {
  API_ROUTES,
  CreateProblemResponseSchema,
  type CreateProblemRequest,
} from "@/lib/schemas/api";

/**
 * Create a coding question, the Park Tudor way: HackerRank's wizard with the two steps we do not
 * need taken out.
 *
 * HackerRank's flow is Question Details → Languages → Code Stubs → Testcases. Ours is three steps,
 * because two of theirs are decisions we have already made for every question:
 *
 *   - there is no TYPE step: every question here is a coding question;
 *   - there is no LANGUAGES step: every question runs in all six, always.
 *
 * So the steps are Details, Starter code (optional), and Test cases. The step rail on the left is
 * HackerRank's, and it is a real navigation aid rather than decoration: a long question is written
 * over several sittings, and the rail says which parts are done.
 *
 * All state lives in this one component. A create is a single POST to /api/admin/problems, which
 * writes the test files and the rows and returns the new problem; on success we go to the bank,
 * where it is now cleared for a contest.
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

export function ProblemBuilder() {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>("details");

  // --- details ---
  const [title, setTitle] = useState("");
  const [statementMd, setStatementMd] = useState("");
  const [inputSpec, setInputSpec] = useState("");
  const [outputSpec, setOutputSpec] = useState("");
  const [constraints, setConstraints] = useState("");
  const [difficulty, setDifficulty] = useState<"E" | "M" | "H">("E");

  // --- starter code ---
  const [wantStarter, setWantStarter] = useState(false);
  const [fnName, setFnName] = useState("solve");
  const [returns, setReturns] = useState<SignatureType>("int");
  const [params, setParams] = useState<DraftParam[]>([{ id: makeId(), name: "n", type: "int" }]);

  // --- test cases ---
  const [cases, setCases] = useState<DraftCase[]>([
    { id: makeId(), input: "", expectedOutput: "", isSample: true },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sampleCount = useMemo(() => cases.filter((c) => c.isSample).length, [cases]);

  const detailsComplete = title.trim() !== "" && statementMd.trim() !== "";
  const testsComplete =
    cases.length > 0 && sampleCount > 0 && cases.every((c) => c.expectedOutput.trim() !== "");

  const create = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body: CreateProblemRequest = {
        title: title.trim(),
        statementMd,
        inputSpec: inputSpec.trim() === "" ? undefined : inputSpec,
        outputSpec: outputSpec.trim() === "" ? undefined : outputSpec,
        constraints: constraints.trim() === "" ? undefined : constraints,
        difficulty,
        signature: wantStarter
          ? {
              name: fnName.trim(),
              returns,
              params: params
                .filter((p) => p.name.trim() !== "")
                .map((p) => ({ name: p.name.trim(), type: p.type })),
            }
          : null,
        testCases: cases.map((c) => ({
          input: c.input,
          expectedOutput: c.expectedOutput,
          isSample: c.isSample,
        })),
      };

      const response = await fetch(API_ROUTES.adminProblems, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload
            ? (payload as { error: { message?: string } }).error.message
            : undefined;
        setError(message ?? "The question could not be created.");
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
      // Straight to the bank, where the new question is now listed and cleared for a contest.
      router.push("/admin/problems");
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
    fnName,
    returns,
    params,
    cases,
    router,
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
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
              write input parsing. The same stub is generated for all six languages. Leave this off
              and the student gets a blank editor and reads stdin themselves.
            </p>
            <label className="flex items-center gap-2" style={{ fontSize: "var(--text-sm)" }}>
              <input
                type="checkbox"
                checked={wantStarter}
                onChange={(e) => setWantStarter(e.target.checked)}
                className="h-4 w-4 accent-panther"
              />
              Give this question starter code
            </label>

            {wantStarter && (
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
                  ? "Ready to create."
                  : "Add a statement and at least one sample test case."
                : "A title and a statement are required."}
            </p>
          )}
          <div className="flex items-center gap-2">
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
              onClick={() => void create()}
            >
              {submitting ? "Creating…" : "Create question"}
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
