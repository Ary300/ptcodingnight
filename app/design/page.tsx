import Image from "next/image";

/**
 * Token specimen. The reviewable artifact of Phase 4a — it exists so the palette, the type
 * scale and the rank-change treatment can be looked at before four frontend agents start
 * building against them.
 *
 * Orchestrator-owned: this route sits outside every agent's partition in docs/PLAN.md §3.
 * It is not part of the contest UI and can be deleted once Phase 5 lands.
 */

const SWATCHES = [
  { name: "ink", hex: "#1A0606", note: "brand near-black", onInk: null, onPaper: "18.65 AAA*" },
  { name: "paper", hex: "#FBF9F8", note: "derived warm white", onInk: "18.65 AAA", onPaper: null },
  { name: "panther", hex: "#C63527", note: "brand primary", onInk: "3.67 large", onPaper: "5.08 AA" },
  { name: "gold", hex: "#FED141", note: "frozen · champion", onInk: "13.44 AAA", onPaper: "1.39 ✗" },
  { name: "rise", hex: "#49C5B1", note: "rank gained", onInk: "9.23 AAA", onPaper: "2.02 ✗" },
  { name: "fall", hex: "#FF9D6E", note: "rank lost", onInk: "9.60 AAA", onPaper: "1.94 ✗" },
] as const;

const STANDINGS = [
  { rank: 1, name: "Player C", score: 450, penalty: 5, delta: 2 },
  { rank: 2, name: "Player B", score: 300, penalty: 0, delta: 0 },
  { rank: 3, name: "Player D", score: 300, penalty: 5, delta: -1 },
  { rank: 4, name: "Player A", score: 220, penalty: 15, delta: -1 },
] as const;

function Delta({ value }: { value: number }) {
  // Glyph first, colour second. DESIGN.md §3: rise and fall differ in luminance by 1.04,
  // so colour alone cannot carry this. U+2191/U+2193/U+2212 — all inside the vendored subset.
  const glyph = value > 0 ? `↑${value}` : value < 0 ? `↓${Math.abs(value)}` : "−";
  const color = value > 0 ? "var(--color-rise)" : value < 0 ? "var(--color-fall)" : "#8a7a76";

  return (
    <span className="numeric" style={{ color }} aria-label={value === 0 ? "no change" : `${value > 0 ? "up" : "down"} ${Math.abs(value)}`}>
      {glyph}
    </span>
  );
}

export default function DesignSpecimen() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-12 flex items-center gap-4">
        <Image src="/brand/pt-crest-color.svg" alt="Park Tudor crest" width={56} height={56} priority />
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
            Coding Night — design tokens
          </h1>
          <p style={{ fontSize: "var(--text-sm)", opacity: 0.7 }}>
            Specimen for <code className="numeric">docs/DESIGN.md</code>. Five of six colours
            are Park Tudor&rsquo;s published palette, verbatim.
          </p>
        </div>
      </header>

      {/* ---- palette ---- */}
      <section className="mb-14">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}>Palette</h2>
        <p className="mb-4" style={{ fontSize: "var(--text-sm)", opacity: 0.7 }}>
          Contrast measured, not eyeballed. Gold, rise and fall are dark-surface only.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SWATCHES.map((s) => (
            <div key={s.name} className="overflow-hidden rounded border border-black/10">
              <div style={{ background: s.hex, height: 72 }} />
              <div className="p-3">
                <div className="flex items-baseline justify-between">
                  <strong style={{ fontSize: "var(--text-sm)" }}>{s.name}</strong>
                  <span className="numeric" style={{ fontSize: "var(--text-xs)", opacity: 0.6 }}>
                    {s.hex}
                  </span>
                </div>
                <div style={{ fontSize: "var(--text-xs)", opacity: 0.7 }}>{s.note}</div>
                <div className="numeric mt-2" style={{ fontSize: "var(--text-xs)", opacity: 0.6 }}>
                  {s.onInk !== null && <div>on ink {s.onInk}</div>}
                  {s.onPaper !== null && <div>on paper {s.onPaper}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- type ---- */}
      <section className="mb-14">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}>Type</h2>
        <div className="mt-4 space-y-3">
          <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)" }}>
            Libre Baskerville — display
          </p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-md)" }}>
            Open Sans — body. Both are the school&rsquo;s own faces, self-hosted; no CDN,
            because the night has no internet.
          </p>
          <p className="numeric" style={{ fontSize: "var(--text-md)" }}>
            JetBrains Mono — 0O 1lI 5S 8B {"↑"}3 {"↓"}2 {"−"}
          </p>
        </div>
      </section>

      {/* ---- projector standings ---- */}
      <section>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}>
          Projector standings
        </h2>
        <p className="mb-4" style={{ fontSize: "var(--text-sm)", opacity: 0.7 }}>
          Shown at app scale, not projector scale. Note the rail, and that every delta is a
          glyph before it is a colour.
        </p>

        <div style={{ background: "var(--color-ink)", padding: "1.5rem", borderRadius: 6 }}>
          <div
            className="mb-3 inline-block px-3 py-1"
            style={{
              background: "var(--color-gold)",
              color: "var(--color-ink)",
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: "var(--text-xs)",
              letterSpacing: "0.08em",
            }}
          >
            BOARD FROZEN
          </div>

          {STANDINGS.map((row) => (
            <div key={row.rank} className="flex items-center gap-4 py-2">
              <div
                style={{
                  width: "var(--rail-width)",
                  alignSelf: "stretch",
                  // No-change is deliberately neutral, not brand red: a red rail sits in
                  // the same warm family as --fall and the two read alike at projector
                  // distance, which defeats the point of the rail.
                  background:
                    row.delta > 0
                      ? "var(--color-rise)"
                      : row.delta < 0
                        ? "var(--color-fall)"
                        : "color-mix(in srgb, var(--color-paper) 22%, transparent)",
                }}
              />
              <span className="numeric w-8" style={{ color: "var(--color-paper)", opacity: 0.6 }}>
                {row.rank}
              </span>
              <span
                className="flex-1"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--text-lg)",
                  color: "var(--color-paper)",
                }}
              >
                {row.name}
              </span>
              <span className="numeric w-12 text-right">
                <Delta value={row.delta} />
              </span>
              <span
                className="numeric w-20 text-right"
                style={{ color: "var(--color-paper)", fontSize: "var(--text-md)" }}
              >
                {row.score}
              </span>
              <span
                className="numeric w-16 text-right"
                style={{ color: "var(--color-paper)", opacity: 0.55 }}
              >
                +{row.penalty}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
