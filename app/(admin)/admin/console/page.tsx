import { LiveConsole } from "@/components/admin/LiveConsole";
import { STUB_JUDGE_HEALTH, STUB_SUBMISSIONS } from "@/components/admin/stub-data";

export default function LiveConsolePage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
          Live console
        </h1>
        <p className="mt-1 max-w-[70ch] opacity-75" style={{ fontSize: "var(--text-sm)" }}>
          Admin truth: this view is never frozen, even while the public board is. Click a
          name to drill into one participant.
        </p>
      </header>

      <LiveConsole submissions={STUB_SUBMISSIONS} health={STUB_JUDGE_HEALTH} />
    </div>
  );
}
