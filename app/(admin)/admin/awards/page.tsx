import { AwardsBoard } from "@/components/admin/AwardsBoard";
import { STUB_CONTEST_NAME, STUB_STANDINGS } from "@/components/admin/stub-data";

export default function AwardsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>Awards</h1>
        <p className="mt-1 max-w-[70ch] opacity-75" style={{ fontSize: "var(--text-sm)" }}>
          Divisions rank independently, so there is an Intermediate winner and an Advanced
          winner. Ties are shown as ties and never broken arbitrarily.
        </p>
      </header>

      <AwardsBoard standings={STUB_STANDINGS} contestName={STUB_CONTEST_NAME} />
    </div>
  );
}
