import { Crumbs } from "@/components/ui";
import { ProblemBuilder } from "@/components/admin/ProblemBuilder";

/**
 * `/admin/problems/new` — create a coding question.
 *
 * The builder stays focused on the choices organizers make here: the statement, optional starter
 * code, and the cases used by the judge. Supported languages are enabled automatically.
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
      <header>
        <h1 className="font-display font-bold leading-tight" style={{ fontSize: "var(--text-xl)" }}>
          Create a coding question
        </h1>
        <p className="mt-tight max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Write the statement, choose the starter code, and add the cases the judge will run.
        </p>
      </header>
      <ProblemBuilder />
    </div>
  );
}
