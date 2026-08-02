import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminNav } from "@/components/admin/AdminNav";
import { OrganizerMenu } from "@/components/admin/OrganizerMenu";
import { signInErrorLocation } from "@/lib/contest/sign-in-errors";
import { isAdmin, viewerFromCookies } from "@/lib/contest/viewer";

/**
 * The organiser shell.
 *
 * ## Why this now matches the competitor chrome
 *
 * It used to be a white page with a hairline rule, the school crest and light nav pills, while
 * every student screen had a dark bar with the panther and a tinted ground under paper cards.
 * They read as two different products, and the organiser half read as the unfinished one.
 *
 * The frame is now the same frame: `--ink` bar, panther mark, tabs underlined in `--panther` when
 * active, tinted ground, content on paper. Nothing about the information changed — a shell that
 * looks built is what makes a dense table look deliberate rather than unstyled.
 *
 * ## The panther, not the crest
 *
 * The crest is the school's formal mark and reads as a seal at 36px on a light ground — it is the
 * asset for a certificate, and DESIGN.md §8 reserves it for the champion reveal. The panther is
 * the product's mark, and is what the student half already uses.
 *
 * ## Wider than the competitor column
 *
 * `max-w-7xl` rather than `max-w-6xl`. The roster, the submission feed and the awards board are
 * tables of six to nine columns; at 1152px they wrap their headers onto two lines, which is most
 * of what "the ratios look off" was describing. The competitor side keeps the narrower measure,
 * because its main content is prose and prose has a measure.
 *
 * Admin stays a quiet surface (DESIGN.md §5): organisers are on this screen for two hours with a
 * room in front of them, so the loud treatments stay reserved for the two things that must not be
 * missed — a failing reference solution, and an unhealthy judge.
 *
 * ## The gate
 *
 * Checked here rather than only in the API routes. Every `/api/admin/**` handler calls
 * `requireAdmin`, so no organizer DATA was ever reachable — but the screens rendered for anybody
 * who typed `/admin`, showing the whole console with one refused panel in the middle of it. A
 * student who finds that reads it as a door that is nearly open.
 *
 * `redirect` rather than a 403 page: an organizer arriving with an expired session wants the
 * sign-in form, not an explanation of why they cannot have the console.
 *
 * The reason travels as a CODE, never as prose. `?error=` used to carry the sentence itself, which
 * meant anybody could hand a student a link whose "error" was a paragraph of their own choosing,
 * rendered in our styling on our domain above our sign-in form. `lib/contest/sign-in-errors.ts`
 * owns the copy now, so the query string can only select from a closed set.
 */

export const metadata: Metadata = {
  title: "Organizer | Park Tudor Coding Night",
  description: "Contest builder, problem authoring, live console, teams, and awards.",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await viewerFromCookies();
  if (!isAdmin(viewer)) {
    redirect(signInErrorLocation("organizer_required"));
  }
  const displayName = viewer.displayName;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <a
        href="#admin-main"
        className="sr-only rounded-chip bg-panther px-3 py-2 text-paper focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>

      <header className="bg-ink text-paper">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-2.5">
          <Link href="/admin" className="flex items-center gap-2.5">
            <Image
              src="/brand/pt-panther.png"
              alt=""
              width={275}
              height={235}
              aria-hidden="true"
              priority
              className="h-8 w-auto"
            />
            <span className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
              Coding Night
            </span>
            {/*
              The role, set apart rather than dimmed. `text-paper/60` on `--ink` composites under
              the 47% floor for paper on ink (DESIGN.md §7); a bordered chip carries the same
              "this is the organiser build" signal at full contrast, and reads from across a room
              — which matters, because putting the organiser console on the projector by mistake
              is a real way to show the room a problem set early.
            */}
            <span
              className="rounded-chip border border-rule-firm-inverse px-1.5 py-0.5 font-semibold uppercase"
              style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}
            >
              Organizer
            </span>
          </Link>

          <AdminNav />

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <Link
              href="/projector"
              className="rounded-chip border border-rule-edge-inverse px-2.5 py-1 font-semibold text-paper/85 hover:border-rule-firm-inverse hover:text-paper"
              style={{ fontSize: "var(--text-xs)" }}
            >
              Open projector
            </Link>

            {/*
              THERE WAS NO WAY TO SIGN OUT OF THE ORGANIZER CONSOLE. Not on any of its seven
              screens, and not on the competitor ones either — `CompetitorChrome` renders its
              account menu only for a joined COMPETITOR, and an organizer is not one.

              The session lasts 12 hours on a `maxAge` cookie, so on the shared projector laptop
              it survived closing the browser into the next day — fronting freeze, rejudge,
              verdict override and side-activity points entry.
            */}
            <OrganizerMenu displayName={displayName} />
          </div>
        </div>
      </header>

      <main id="admin-main" className="flex-1 bg-ink/[0.035]">
        <div className="mx-auto w-full max-w-7xl px-5 py-7">{children}</div>
      </main>
    </div>
  );
}
