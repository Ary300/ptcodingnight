import { ProblemBank } from "@/components/admin/ProblemBank";
import { STUB_PROBLEMS } from "@/components/admin/stub-data";

export default function ProblemsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
          Problem bank
        </h1>
        <p className="mt-1 max-w-[70ch] opacity-75" style={{ fontSize: "var(--text-sm)" }}>
          Titles and history were imported from the past-contest index. Statements and test
          data are written here, never copied.
        </p>
      </header>

      <ProblemBank problems={STUB_PROBLEMS} />
    </div>
  );
}
