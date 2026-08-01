import Link from "next/link";

/**
 * The 404 page, which did not exist until a navigation audit walked into the default one.
 *
 * Next's built-in not-found is a bare "404 | This page could not be found." with ZERO links -
 * the only way out is the browser's back button. That is not a corner case here: a re-seed
 * renames every problem id, so a student's bookmarked problem URL from earlier in the evening is
 * a live path to this page, and the audit hit exactly that while it was running.
 *
 * The links cover the three people who can arrive: a student (the contest), anyone (the board),
 * and the home page for everyone else. No session read - a 404 should never be the page that
 * breaks, so it depends on nothing.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 bg-ink/[0.035] px-4 py-16">
      <p className="numeric font-display font-bold text-panther" style={{ fontSize: "var(--text-xl)" }}>
        404
      </p>
      <div className="text-center">
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
          That page is not here.
        </h1>
        <p className="mt-2 max-w-[46ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          The link may be stale. If you bookmarked a problem, open the contest and find it in the
          list, because problem links can change between contests.
        </p>
      </div>
      <nav aria-label="Ways out" className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/contest"
          className="rounded bg-panther px-5 py-2.5 font-semibold text-paper hover:bg-panther-deep"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Open the contest
        </Link>
        <Link
          href="/"
          className="rounded border border-ink/25 px-5 py-2.5 font-semibold hover:border-ink/50 hover:bg-ink/[0.03]"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Home page
        </Link>
        <Link
          href="/projector"
          className="rounded px-3 py-2.5 text-ink/75 hover:text-ink"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Live standings
        </Link>
      </nav>
    </div>
  );
}
