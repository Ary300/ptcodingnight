import { ContestBuilder } from "@/components/admin/ContestBuilder";

export default function ContestBuilderPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
          Contest builder
        </h1>
        <p className="mt-1 max-w-[70ch] opacity-75" style={{ fontSize: "var(--text-sm)" }}>
          Set the window, the divisions, the preset and the freeze before the night, so
          nothing here is being decided while students are waiting.
        </p>
      </header>

      <ContestBuilder />
    </div>
  );
}
