import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { AdminNav } from "@/components/admin/AdminNav";

/**
 * The organiser shell.
 *
 * Admin is a `--paper` surface (DESIGN.md §5): quiet ground, `--ink` text, one accent.
 * Organisers are on this screen for two hours with a room in front of them, so it stays out
 * of the way — the loud treatments are reserved for the two things that must not be missed,
 * a failing reference solution and an unhealthy judge.
 */

export const metadata: Metadata = {
  title: "Organiser - Park Tudor Coding Night",
  description: "Contest builder, problem authoring, live console, and awards.",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <a
        href="#admin-main"
        className="sr-only rounded bg-panther px-3 py-2 text-paper focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <header className="border-b border-ink/12">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <Link href="/admin" className="flex items-center gap-3">
            {/* The crest is the school's mark, not a decorative asset: outline variant
                everywhere except the champion reveal (DESIGN.md §8). */}
            <Image
              src="/brand/pt-crest-outline.svg"
              alt=""
              width={36}
              height={36}
              aria-hidden="true"
            />
            <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-md)" }}>
              {/* text-ink/60, NOT opacity-60. A wrapper's opacity multiplies with any alpha on the
                  children, so it composites far below what the number suggests — and the floor for
                  ink on paper is 57% (docs/DESIGN.md §7). Caught by G9's team-screens spec. */}
              Coding Night <span className="text-ink/60">organiser</span>
            </span>
          </Link>
          <AdminNav />
        </div>
      </header>

      <main id="admin-main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
        {children}
      </main>
    </div>
  );
}
