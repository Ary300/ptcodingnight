import Link from "next/link";
import { notFound } from "next/navigation";

import { AlertPlate } from "@/components/admin/Panel";
import { ProblemBuilder } from "@/components/admin/ProblemBuilder";
import { Crumbs } from "@/components/ui";
import {
  loadAuthoredProblem,
  problemUsage,
  type AuthoredProblemDraft,
  type ProblemUsage,
} from "@/lib/contest/problem-author";
import { isDomainError } from "@/lib/errors";

/**
 * `/admin/problems/<slug>/edit` — change a question that already exists.
 *
 * ## The two ways this screen refuses, and why both are here rather than at Save
 *
 * A form that accepts every keystroke and then rejects the Save has wasted the twenty minutes in
 * between. Both refusals are knowable before a single field renders, so both are answered before
 * one does:
 *
 *  - **A contest is live on this question.** Its test data is what already-judged verdicts mean.
 *    `assertEditable` refuses the PATCH as well, because the screen is not the only door.
 *  - **A test case points at a file that cannot be read.** `loadAuthoredProblem` refuses rather
 *    than handing back an empty box, because an empty box beside a case that has real content is
 *    a screen that lies, and the first Save would make it true.
 *
 * ## Server component on purpose
 *
 * The test data is on the judge host's disk, not behind an API, and the builder needs it in its
 * first render or the organizer watches their question appear field by field. Reading it here and
 * passing it down means the form is complete the moment it exists.
 */

export const dynamic = "force-dynamic";

type LoadResult =
  | { readonly ok: true; readonly draft: AuthoredProblemDraft }
  | { readonly ok: false; readonly reason: string };

async function loadDraft(slug: string): Promise<LoadResult> {
  try {
    return { ok: true, draft: await loadAuthoredProblem(slug) };
  } catch (error) {
    if (isDomainError(error) && error.code === "NOT_FOUND") notFound();
    // Every other domain error from this path is one we authored (see `readAuthoredFile`), so it
    // is safe to put on the page. Anything else is our bug and belongs to the error boundary.
    if (isDomainError(error)) return { ok: false, reason: error.publicMessage };
    throw error;
  }
}

export default async function EditProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loaded = await loadDraft(slug);

  if (!loaded.ok) {
    return (
      <EditShell slug={slug} title={slug}>
        <AlertPlate tone="alarm" title="This question cannot be opened for editing" live={false}>
          <p>{loaded.reason}</p>
        </AlertPlate>
      </EditShell>
    );
  }

  const draft = loaded.draft;
  const usage = await problemUsage(draft.problemId);

  if (usage.lockedBy.length > 0) {
    return (
      <EditShell slug={slug} title={draft.title}>
        <LockedByContest usage={usage} />
      </EditShell>
    );
  }

  return (
    <EditShell slug={slug} title={draft.title}>
      <ProblemBuilder
        edit={{
          slug: draft.slug,
          judgedSubmissionCount: usage.judgedSubmissionCount,
          initial: {
            title: draft.title,
            statementMd: draft.statementMd,
            inputSpec: draft.inputSpec,
            outputSpec: draft.outputSpec,
            constraints: draft.constraints,
            difficulty: draft.difficulty,
            signature: draft.signature,
            signatureEditable: draft.signatureEditable,
            testCases: draft.testCases,
          },
        }}
      />
    </EditShell>
  );
}

function EditShell({
  slug,
  title,
  children,
}: {
  slug: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Crumbs
        trail={[
          { href: "/admin", label: "Contests" },
          { href: "/admin/problems", label: "Problem bank" },
          { href: `/admin/problems/${slug}`, label: title },
          { label: "Edit" },
        ]}
      />
      <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
        Edit {title}
      </h1>
      {children}
    </div>
  );
}

function LockedByContest({ usage }: { usage: ProblemUsage }) {
  return (
    <>
      <AlertPlate tone="alarm" title="A contest is using this question right now" live={false}>
        <p>
          Changing the statement or the test data would rewrite what verdicts the judge has already
          written mean, and the board would keep showing scores derived from cases that no longer
          exist. This question unlocks when the contest ends.
        </p>
        <ul className="mt-group list-disc pl-5">
          {usage.lockedBy.map((use) => (
            <li key={`${use.contestId}-${use.slotLabel}`}>
              <Link href={`/admin/contests/${use.contestId}`} className="underline underline-offset-4">
                {use.contestName}
              </Link>{" "}
              ({use.contestState.toLowerCase()}), slot {use.slotLabel}
            </li>
          ))}
        </ul>
      </AlertPlate>
      <p style={{ fontSize: "var(--text-sm)" }}>
        A mistake in a question that is live is fixed on the console, not here: override the
        affected submissions, or rejudge them once the wording is settled.
      </p>
    </>
  );
}
