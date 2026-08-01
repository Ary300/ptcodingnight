import { Crumbs } from "@/components/ui";
import { ProblemBuilder } from "@/components/admin/ProblemBuilder";

/**
 * `/admin/problems/new` — create a coding question.
 *
 * The Park Tudor version of HackerRank's "Create Coding Question", with its two unneeded steps
 * removed: no question type (all coding) and no language selection (all six, always). What is left
 * is a statement and test cases, plus optional function-stub starter code.
 */
export const dynamic = "force-dynamic";

export default function NewProblemPage() {
  return (
    <div className="flex flex-col gap-4">
      <Crumbs
        trail={[
          { href: "/admin", label: "Contests" },
          { href: "/admin/problems", label: "Problem bank" },
          { label: "New question" },
        ]}
      />
      <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
        Create a coding question
      </h1>
      <ProblemBuilder />
    </div>
  );
}
