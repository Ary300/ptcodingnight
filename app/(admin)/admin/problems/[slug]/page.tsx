import Link from "next/link";
import { notFound } from "next/navigation";

import { Panel } from "@/components/admin/Panel";
import { ProblemStatePill } from "@/components/admin/StatusPill";
import { Markdown } from "@/components/contest/markdown/Markdown";
import { prisma } from "@/lib/db";

/**
 * `/admin/problems/<slug>` — read a problem exactly as the judge has it.
 *
 * ## Why this is a VIEW and not an editor
 *
 * It used to be a full authoring workbench: statement editor, test-case editor, and a "Run
 * reference against all cases" button. None of it saved anything — the problem was looked up from
 * `stub-data.ts`, there was no Save control anywhere on the page, and typing a statement and
 * reloading lost it.
 *
 * The reference runner was worse than useless. `stubReferenceRun` decided pass or fail by looking
 * at whether the expected output was blank or self-contradictory; it never compiled or executed a
 * single line. An organizer pressed it and got a green "reference passed" that proved nothing —
 * and the one rule this project is most insistent about is that **a reference solution which
 * passes locally is not a judgeable problem** (CLAUDE.md). Only G13 knows, because only G13 runs
 * the thing through the real judge in a real container.
 *
 * Rather than build a browser editor that would be a second, weaker source of truth, this states
 * where authoring actually happens. Problems are FILES in this repository, reviewed like code and
 * verified by `npm run test:content`. A screen that silently discarded an organizer's work was a
 * trap; a screen that tells them where the work goes is not.
 */
export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const problem = await prisma.problem.findUnique({
    where: { slug },
    select: {
      title: true,
      slug: true,
      state: true,
      difficulty: true,
      round: true,
      statementMd: true,
      timeLimitMs: true,
      memoryLimitMb: true,
      allowedLanguages: true,
      originAttribution: true,
      _count: { select: { testCases: true, contestProblems: true } },
      testCases: { where: { isSample: true }, select: { id: true } },
    },
  });

  if (problem === null) notFound();

  const uiState = problem.state === "PUBLISHED" ? "READY" : problem.state === "RETIRED" ? "ARCHIVED" : "DRAFT";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/problems"
        className="underline underline-offset-4"
        style={{ fontSize: "var(--text-sm)" }}
      >
        Back to the problem bank
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          {problem.title}
        </h1>
        <ProblemStatePill state={uiState} />
        <code className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
          {problem.slug}
        </code>
      </header>

      <Panel
        title="Where this problem is edited"
        description="Problems are files in this repository, not rows edited in a browser."
      >
        <p style={{ fontSize: "var(--text-sm)" }}>
          The statement, the reference solution and the test data live in{" "}
          <code>content/problems/{problem.slug}/</code>. Change them there, re-run{" "}
          <code>npx tsx scripts/seed-demo.ts</code> to load them, and{" "}
          <code>npm run test:content</code> to prove the reference solution still passes{" "}
          <strong>through the real judge</strong>.
        </p>
        <p className="mt-3 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          This screen used to offer a statement editor and a &ldquo;run the reference&rdquo; button.
          Neither saved anything, and the reference check never executed any code — it inspected the
          expected output and guessed. A green result that proves nothing is the most expensive kind
          of wrong, so it is gone rather than half-fixed.
        </p>
      </Panel>

      <Panel title="As the judge has it">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2" style={{ fontSize: "var(--text-sm)" }}>
          <Row label="Round">{problem.round}</Row>
          <Row label="Difficulty">{problem.difficulty ?? "—"}</Row>
          <Row label="Time limit">
            <span className="numeric">{problem.timeLimitMs} ms</span>
          </Row>
          <Row label="Memory limit">
            <span className="numeric">{problem.memoryLimitMb} MB</span>
          </Row>
          <Row label="Test cases">
            <span className="numeric">
              {problem._count.testCases} ({problem.testCases.length} sample)
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
      </Panel>

      <Panel
        title="Statement"
        description="Rendered exactly as a student sees it. Empty means nobody has written one yet, which is what keeps this problem in DRAFT."
      >
        {problem.statementMd.trim() === "" ? (
          <p role="status" className="text-panther font-semibold" style={{ fontSize: "var(--text-sm)" }}>
            No statement has been written. This problem cannot go into a live contest.
          </p>
        ) : (
          <Markdown source={problem.statementMd} />
        )}
      </Panel>
    </div>
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
