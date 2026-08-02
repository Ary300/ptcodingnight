import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { TextInput } from "@/components/admin/Field";
import { AlertPlate, Panel } from "@/components/admin/Panel";
import { ProblemStatePill } from "@/components/admin/StatusPill";
import { Markdown } from "@/components/contest/markdown/Markdown";
import { Button, Crumbs } from "@/components/ui";
import {
  assertDeletable,
  checkTestDataPresent,
  deleteAuthoredProblem,
  problemUsage,
  type ProblemUsage,
} from "@/lib/contest/problem-author";
import { requireAdmin, viewerFromCookies } from "@/lib/contest/viewer";
import { prisma } from "@/lib/db";
import { isDomainError } from "@/lib/errors";
import { VARIANTS, type LanguageId } from "@/lib/judge/runtimes";
import { startersFor } from "@/lib/judge/starters";
import { SignatureSchema } from "@/lib/schemas/seed";

/**
 * `/admin/problems/<slug>` — read a question the way the judge has it, and the way a student will.
 *
 * ## What this page used to claim, and why the claim had to go
 *
 * It said, in as many words, that problems are files in this repository and that this screen is
 * not where they are edited. That was true of the seeded bank, and it stopped being true the day
 * `/admin/problems/new` shipped: a question written in the browser has no `problem.json`, no
 * reference solution, and no directory to send anybody to. The instruction pointed at nothing.
 *
 * Before that it was worse. There was a "run the reference against all cases" button whose runner
 * decided pass or fail by inspecting whether the expected output looked blank or self
 * contradictory. It never compiled or executed a line, and it reported green. That is the exact
 * failure this codebase keeps naming, and it is why the panel below separates what this system has
 * actually CHECKED from what nothing on this screen can know.
 *
 * ## The preview is the point of the page
 *
 * HackerRank calls it "See candidate preview", and it exists because an author cannot proofread a
 * generated stub from the signature alone. A parameter order that reads wrong, an array whose
 * length field lands in the wrong place, a function name that collides with a keyword in one
 * language out of ten: every one of those is obvious in the emitted code and invisible in the form
 * that produced it. These starters come from `startersFor`, the same pure function that fills the
 * student's editor, so this is the file they will open rather than a rendering of it.
 *
 * ## Delete is a server action, and the typed name is checked on the server
 *
 * A deletion a stray click can complete takes test data off disk. The confirmation is the
 * question's own name, typed, and `deleteAuthoredProblem` is what compares it, so this form and
 * the API route cannot disagree about what counts as confirmation. The failure path carries a CODE
 * in the query string and never prose: `?error=` rendering text somebody else wrote, in our
 * styling, on our domain, is a bug this project has already shipped once.
 */

export const dynamic = "force-dynamic";

/** Why a delete did not happen. A closed set, so the query string can never carry copy. */
const DELETE_FAILURES: Readonly<Record<string, string>> = {
  mismatch:
    "The name you typed did not match this question's name exactly, so nothing was deleted. Check for a missing word or a stray space.",
  conflict:
    "This question is in use, so it was not deleted. Reload the page to see what is using it now.",
  missing: "That question no longer exists. Somebody may have deleted it already.",
  failed: "The question could not be deleted, and nothing was changed.",
};

/**
 * Delete the question, or come back with a code saying why not.
 *
 * `bind` supplies the slug, so it is never a form field that could be retargeted at another
 * question by editing the page. The organizer check is repeated here because a server action is
 * its own entry point: the layout's gate protects the SCREEN and does not run for a POST.
 */
async function deleteProblemAction(slug: string, formData: FormData): Promise<void> {
  "use server";

  requireAdmin(await viewerFromCookies());
  const confirmTitle = formData.get("confirmTitle");

  let failure: string | null = null;
  try {
    await deleteAuthoredProblem(slug, {
      confirmTitle: typeof confirmTitle === "string" ? confirmTitle : "",
    });
  } catch (error) {
    if (!isDomainError(error)) throw error;
    failure =
      error.code === "VALIDATION"
        ? "mismatch"
        : error.code === "NOT_FOUND"
          ? "missing"
          : error.code === "CONFLICT"
            ? "conflict"
            : "failed";
  }

  // Outside the try, because `redirect` works by throwing: a catch that swallowed it would turn
  // every successful delete into a page that sat there saying nothing had happened.
  redirect(
    failure === null
      ? "/admin/problems"
      : `/admin/problems/${encodeURIComponent(slug)}?delete=${failure}`,
  );
}

export default async function ProblemPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  const problem = await prisma.problem.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      slug: true,
      state: true,
      difficulty: true,
      round: true,
      statementMd: true,
      inputSpec: true,
      outputSpec: true,
      constraints: true,
      timeLimitMs: true,
      memoryLimitMb: true,
      allowedLanguages: true,
      originAttribution: true,
      signature: true,
      _count: { select: { testCases: true, contestProblems: true } },
      testCases: { where: { isSample: true }, select: { id: true } },
    },
  });

  if (problem === null) notFound();

  const [usage, testData] = await Promise.all([
    problemUsage(problem.id),
    checkTestDataPresent(problem.id),
  ]);

  const uiState =
    problem.state === "PUBLISHED" ? "READY" : problem.state === "RETIRED" ? "ARCHIVED" : "DRAFT";

  // Parsed, not assumed. `signature` is a JSON column, so Prisma calls it `JsonValue` and a row
  // written by an older build is untrusted input on the way out as much as on the way in.
  const parsedSignature = SignatureSchema.safeParse(problem.signature);
  const starters = parsedSignature.success
    ? startersFor(parsedSignature.data, problem.allowedLanguages as readonly LanguageId[])
    : [];
  const signatureUnreadable = problem.signature !== null && !parsedSignature.success;

  const locked = usage.lockedBy.length > 0;
  const deleteBlocked = deletionBlocker(problem.title, usage);
  const deleteFailure = failureCopy(query.delete);
  const sampleCount = problem.testCases.length;

  return (
    <div className="flex flex-col gap-6">
      <Crumbs
        trail={[
          { href: "/admin", label: "Contests" },
          { href: "/admin/problems", label: "Problem bank" },
          { label: problem.title },
        ]}
      />

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
            {problem.title}
          </h1>
          <ProblemStatePill state={uiState} />
          <code className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
            {problem.slug}
          </code>
        </div>
        {locked ? (
          <p className="shrink-0 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            Locked while a contest is using it.
          </p>
        ) : (
          <Link
            href={`/admin/problems/${problem.slug}/edit`}
            className="shrink-0 rounded bg-panther px-4 py-2 font-semibold text-paper hover:bg-panther-deep"
            style={{ fontSize: "var(--text-sm)" }}
          >
            Edit this question
          </Link>
        )}
      </header>

      {deleteFailure !== null && (
        <AlertPlate tone="alarm" title="This question was not deleted">
          <p>{deleteFailure}</p>
        </AlertPlate>
      )}

      <Panel
        title="Readiness checks"
        description="Review the question data before adding it to a live contest."
      >
        <div className="grid gap-6 sm:grid-cols-2" style={{ fontSize: "var(--text-sm)" }}>
          <div>
            <h3 className="font-semibold">Available now</h3>
            <ul className="mt-tight flex flex-col gap-1.5">
              <Fact ok={problem.statementMd.trim() !== ""}>
                {problem.statementMd.trim() !== ""
                  ? "An original statement is written."
                  : "No statement is written, so this question cannot go into a live contest."}
              </Fact>
              <Fact ok={problem._count.testCases > 0}>
                {problem._count.testCases} test case{problem._count.testCases === 1 ? "" : "s"} are
                stored.
              </Fact>
              <Fact ok={sampleCount > 0}>
                {sampleCount > 0
                  ? `${String(sampleCount)} of them are samples, so a student can see a worked example.`
                  : "No sample case, so a student has nothing to self-check against."}
              </Fact>
              <Fact ok={testData.missing.length === 0}>
                {testData.missing.length === 0
                  ? `All ${String(testData.fileCount)} test files are readable on this host.`
                  : `${String(testData.missing.length)} of ${String(testData.fileCount)} test files cannot be read on this host, so a submission against this question would come back as IE.`}
              </Fact>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">Still verify</h3>
            <p className="mt-tight text-ink/70">
              Run the content test before the contest. It sends the reference solution through the
              same judge, limits, and language runtime used for student submissions.
            </p>
            <p className="mt-tight text-ink/70">
              Check every expected output carefully. A wrong expected output will reject a correct
              solution.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="As the judge has it">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2" style={{ fontSize: "var(--text-sm)" }}>
          <Row label="Round">{problem.round}</Row>
          <Row label="Difficulty">{problem.difficulty ?? "-"}</Row>
          <Row label="Time limit">
            <span className="numeric">{problem.timeLimitMs} ms</span>
          </Row>
          <Row label="Memory limit">
            <span className="numeric">{problem.memoryLimitMb} MB</span>
          </Row>
          <Row label="Test cases">
            <span className="numeric">
              {problem._count.testCases} ({sampleCount} sample)
            </span>
          </Row>
          <Row label="In contests">
            <span className="numeric">{problem._count.contestProblems}</span>
          </Row>
          <Row label="Languages">
            <span className="numeric">{problem.allowedLanguages.join(", ")}</span>
          </Row>
          <Row label="Origin">{problem.originAttribution ?? "Original"}</Row>
        </dl>

        {usage.contests.length > 0 && (
          <ul className="mt-group flex flex-col gap-1.5" style={{ fontSize: "var(--text-sm)" }}>
            {usage.contests.map((use) => (
              <li key={`${use.contestId}-${use.slotLabel}`}>
                <Link
                  href={`/admin/contests/${use.contestId}`}
                  className="underline underline-offset-4"
                >
                  {use.contestName}
                </Link>{" "}
                <span className="text-ink/70">
                  ({use.contestState.toLowerCase()}), slot {use.slotLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Student preview"
        description="This uses the same statement renderer students see during the contest."
      >
        {problem.statementMd.trim() === "" ? (
          <p
            role="status"
            className="text-panther font-semibold"
            style={{ fontSize: "var(--text-sm)" }}
          >
            No statement has been written. This question cannot go into a live contest.
          </p>
        ) : (
          <article className="min-w-0">
            <Markdown source={problem.statementMd} />
            <PreviewSection title="Input" source={problem.inputSpec} />
            <PreviewSection title="Output" source={problem.outputSpec} />
            <PreviewSection title="Constraints" source={problem.constraints} />
          </article>
        )}
      </Panel>

      <Panel
        title="Starter code"
        description="Preview the generated starter file for each allowed language."
      >
        {signatureUnreadable ? (
          <p
            role="status"
            className="text-panther font-semibold"
            style={{ fontSize: "var(--text-sm)" }}
          >
            This question stores a signature that does not parse, so no starter code can be
            generated from it and a student would get an empty editor.
          </p>
        ) : starters.length === 0 ? (
          <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            This question has no starter code, which is the normal case. The student gets an empty
            editor and reads stdin themselves.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {starters.map((starter, index) => (
              <details
                key={starter.language}
                // The first open and the rest closed. Ten fully expanded files is a page nobody
                // scrolls; one open file is a page somebody reads.
                open={index === 0}
                className="rounded border border-rule-edge"
              >
                <summary
                  className="cursor-pointer px-4 py-2 font-semibold"
                  style={{ fontSize: "var(--text-sm)" }}
                >
                  {VARIANTS[starter.language].label}
                </summary>
                <pre className="overflow-x-auto border-t border-rule-edge px-4 py-3">
                  <code className="font-mono" style={{ fontSize: "var(--text-xs)" }}>
                    {starter.code}
                  </code>
                </pre>
              </details>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Delete this question"
        description="This permanently removes the question and its test files."
      >
        {deleteBlocked !== null ? (
          <p role="status" style={{ fontSize: "var(--text-sm)" }}>
            {deleteBlocked}
          </p>
        ) : (
          <form
            action={deleteProblemAction.bind(null, problem.slug)}
            className="flex flex-col gap-3"
          >
            <p style={{ fontSize: "var(--text-sm)" }}>
              {usage.contests.length > 0
                ? `This question is in ${String(usage.contests.length)} contest line-up${
                    usage.contests.length === 1 ? "" : "s"
                  }, and deleting it takes it out of ${
                    usage.contests.length === 1 ? "that one" : "all of them"
                  }.`
                : "This question is not in any contest line-up."}{" "}
              To confirm, type the question&rsquo;s name exactly.
            </p>
            <div className="max-w-md">
              <TextInput
                label="Question name"
                name="confirmTitle"
                required
                autoComplete="off"
                placeholder={problem.title}
                hint={`Type "${problem.title}" to confirm.`}
              />
            </div>
            <div>
              <Button type="submit" variant="danger">
                Delete this question
              </Button>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}

/**
 * The reason this question cannot be deleted, or null when it can be.
 *
 * Asks `assertDeletable` rather than restating its conditions, so the screen cannot offer a delete
 * the route would refuse, and cannot hide one the route would allow.
 */
function deletionBlocker(title: string, usage: ProblemUsage): string | null {
  try {
    assertDeletable(title, usage);
    return null;
  } catch (error) {
    return isDomainError(error) ? error.publicMessage : "This question cannot be deleted.";
  }
}

/** A query-string code, resolved to copy we wrote. Never the query string itself. */
function failureCopy(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  return DELETE_FAILURES[value] ?? null;
}

function PreviewSection({ title, source }: { title: string; source: string }) {
  // An author who wrote the input format into the statement leaves this column empty. Rendering
  // the heading anyway prints a bold word with nothing under it, which reads as content that
  // failed to load rather than content that was never there.
  if (source.trim() === "") return null;
  return (
    <section className="mt-8">
      <h3 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
        {title}
      </h3>
      <Markdown source={source} className="mt-1" />
    </section>
  );
}

/**
 * One checked fact. The state carries a word as well as a mark, because colour alone is never the
 * signal (DESIGN.md), and the mark is `aria-hidden` so a screen reader reads the sentence rather
 * than a decorative glyph.
 */
function Fact({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden="true" className={ok ? "text-ink" : "text-panther"}>
        {ok ? "✓" : "!"}
      </span>
      <span>
        <span className="sr-only">{ok ? "Yes: " : "Attention: "}</span>
        {children}
      </span>
    </li>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-ink/10 pb-2">
      <dt className="text-ink/70">{label}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}
