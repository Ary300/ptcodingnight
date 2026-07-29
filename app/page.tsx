/**
 * Placeholder landing page.
 *
 * Intentionally plain — the token system lands in docs/DESIGN.md at Phase 4a and the
 * projector leaderboard is built in Phase 5. Anything decorative written now would be
 * thrown away, and PRD §11 is explicit that this must not end up looking like a generic
 * dashboard.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 p-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Park Tudor Coding Night</h1>
        <p className="mt-2 text-sm opacity-70">Contest platform — under construction.</p>
      </header>

      <section className="text-sm leading-relaxed">
        <p>
          The skeleton and shared contracts are in place. The judge, the scoring engine, and
          the contest UI are not built yet.
        </p>
        <p className="mt-3 opacity-70">
          Build order and gate status live in <code>docs/PLAN.md</code>. The spec of record
          is <code>docs/PRD.md</code>.
        </p>
      </section>
    </main>
  );
}
