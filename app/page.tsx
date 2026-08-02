import Image from "next/image";
import Link from "next/link";

import { viewerFromCookies } from "@/lib/contest/viewer";

/** The public front door for students, families, and organizers. */

const HOW = [
  {
    n: "1",
    title: "Sign in",
    body: "Use your Park Tudor Google account or GitHub. Your first sign-in creates your account.",
  },
  {
    n: "2",
    title: "Find your team",
    body: "An organizer adds you to a team and assigns your question set.",
  },
  {
    n: "3",
    title: "Start solving",
    body: "Work on your assigned problems. Team questions are shared by everyone on the team.",
  },
  {
    n: "4",
    title: "Check the results",
    body: "Submit from the editor and watch the standings update as results come in.",
  },
] as const;

/**
 * The board in the hero.
 *
 * Static, and deliberately so — it is a picture of the product, not a live read. It renders the
 * one thing that is not HackerRank: teams ranked by a mean, with each player's set as its own
 * column, so a visitor sees the arithmetic before they have signed in to anything.
 *
 * The numbers are internally consistent (each total is the sum of the sets, and each score is that
 * total over the team size plus side points) because somebody will check, and a hero image that
 * does not add up is a claim about the scoring engine that the scoring engine did not make.
 */
const BOARD_PREVIEW = [
  // 1155 / 3 = 385, + 40 side = 425.00
  { rank: 1, team: "Panthers", sets: [420, 385, 350], side: 40, score: "425.00" },
  // Two players, not three. A smaller team divides by a smaller number, which is the whole reason
  // team size is derived from the roster and never stored: 760 / 2 = 380, + 25 = 405.00.
  { rank: 2, team: "Cubs", sets: [400, 360], side: 25, score: "405.00" },
  // 865 / 3 = 288.33 (half away from zero, at the one rounding site), + 10 = 298.33
  { rank: 3, team: "Night Owls", sets: [300, 290, 275], side: 10, score: "298.33" },
] as const;

/**
 * The hero's product panel: the team board, as a real table.
 *
 * A table rather than a grid of divs, because it IS one — and because the projector and the
 * competitor board are both tables, so a visitor recognises the screen when they get to it.
 *
 * `aria-hidden` is deliberately NOT set: this is content, not decoration. The caption says out
 * loud that the numbers are an example, so a screen reader is never told a placing that does not
 * exist.
 */
function BoardPreview() {
  const widest = Math.max(...BOARD_PREVIEW.map((row) => row.sets.length));

  return (
    /*
      `motion-swap-in` so the panel takes the second slot of the hero's `motion-stagger` (the
      copy column is the first). Transform-only: the caption and the set cells are alpha'd ink,
      which is exactly the text the entrance rule forbids fading over.
    */
    <div className="motion-swap-in overflow-hidden rounded-panel border border-rule-edge bg-paper shadow-[0_1px_2px_color-mix(in_srgb,var(--color-ink)_6%,transparent),0_8px_24px_-12px_color-mix(in_srgb,var(--color-ink)_25%,transparent)]">
      <div className="flex items-center justify-between border-b border-rule-hair bg-ink px-4 py-2.5 text-paper">
        <span className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
          Team standings
        </span>
        <span className="text-paper/85" style={{ fontSize: "var(--text-xs)" }}>
          Live
        </span>
      </div>

      {/*
        A `<p>` above the scroller, not a `<caption>` inside it: prose must not scroll with the
        table. As a caption it rode along inside `overflow-x-auto` and clipped mid-word at 360
        (409px of sentence in a 326px viewport). `aria-describedby` keeps the table announcing it.
      */}
      <p
        id="board-preview-caption"
        className="px-4 pt-3 text-left text-ink/60"
        style={{ fontSize: "var(--text-xs)" }}
      >
        Sample standings. Team score is the team average plus side points.
      </p>
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse"
          style={{ fontSize: "var(--text-xs)" }}
          aria-describedby="board-preview-caption"
        >
          <thead>
            <tr className="border-b border-rule-edge text-ink/60">
              <th scope="col" className="px-3 py-2 text-left font-semibold">
                #
              </th>
              <th scope="col" className="w-full px-3 py-2 text-left font-semibold">
                Team
              </th>
              {/*
                Score directly after Team, sets and side behind it: this panel's stated purpose is
                the score, and with the sets first the Score column sat entirely off-screen at 360
                (scrollWidth 409 vs 326 visible) with nothing to say more existed.
              */}
              <th scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                Score
              </th>
              {Array.from({ length: widest }, (_, index) => (
                <th
                  key={index}
                  scope="col"
                  className="px-3 py-2 text-right font-semibold whitespace-nowrap"
                >
                  Set {String.fromCharCode(65 + index)}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                Side
              </th>
            </tr>
          </thead>
          <tbody>
            {BOARD_PREVIEW.map((row) => (
              <tr key={row.team} className="border-b border-rule-hair last:border-b-0">
                <td className="numeric px-3 py-2.5 text-ink/70">{row.rank}</td>
                <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{row.team}</td>
                <td className="numeric px-3 py-2.5 text-right font-bold">{row.score}</td>
                {Array.from({ length: widest }, (_, index) => (
                  <td key={index} className="numeric px-3 py-2.5 text-right text-ink/75">
                    {/*
                      A dash, not a zero: this team has no player in that set, and a 0 would
                      read as a player who scored nothing. The glyph is an EN dash because the
                      house rule bans U+2014 from anything a user can read, and the guard test
                      (tests/unit/no-em-dash.test.ts) fails the build if one comes back.

                      The dash alone is silence to a screen reader, so the reason is spelled out
                      in sr-only text rather than left to a punctuation mark.
                    */}
                    {row.sets[index] ?? (
                      <span className="text-ink/40">
                        <span aria-hidden="true">&ndash;</span>
                        <span className="sr-only">no player</span>
                      </span>
                    )}
                  </td>
                ))}
                <td className="numeric px-3 py-2.5 text-right text-ink/75">{row.side}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function Home() {
  /*
    THE FRONT DOOR KNOWS WHO IS STANDING AT IT, which it did not for one full audit cycle.

    A signed-in student who wandered back to `/` was shown the stranger's page: "Log in",
    "Create your account", "Sign in to compete" - and `/sign-in` does not bounce a live session,
    so the loop was `/` -> Log in -> sign-in form -> "Back to the home page" -> `/`. The only way
    into the contest was typing `/contest` by hand. Found once, reported fixed, and found open
    again by the navigation audit, because the fix had gone into the header and not the hero.

    One read of the session cookie decides every call to action on the page at once. The
    marketing copy stays for everyone; what changes is where the buttons point.
  */
  const viewer = await viewerFromCookies();
  const destination = viewer.kind === "admin" ? "/admin" : "/contest";
  const enterLabel = viewer.kind === "admin" ? "Open the organizer console" : "Open the contest";
  const signedIn = viewer.kind !== "anonymous";

  return (
    <div className="flex min-h-full flex-col bg-ink/[0.035]">
      {/* --- slim bar, the shape HackerRank uses above its hero ------------- */}
      <header className="border-b border-rule-hair bg-paper">
        {/*
          `flex-wrap` on the bar plus `whitespace-nowrap` on every label: at 360 the header used
          to collapse into four columns of stacked words ("Coding / Night", "Log / in", a
          three-line CTA). Phrases never break mid-word now; if the row is too narrow the nav
          drops below the wordmark as a whole row.
        */}
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="flex items-center gap-2.5">
            <Image
              src="/brand/pt-panther.png"
              alt=""
              aria-hidden="true"
              width={275}
              height={235}
              priority
              className="h-7 w-auto"
            />
            <span
              className="font-display font-bold whitespace-nowrap"
              style={{ fontSize: "var(--text-sm)" }}
            >
              Coding Night
            </span>
          </span>

          {/*
            A quiet text link and one filled button, which is the pair HackerRank puts here
            ("Log In" beside "Create a free account"). The filled one says CREATE, not "sign in",
            and that wording is the fix for a real confusion: this site had a Sign in page and no
            Sign up page, so a student with no account could not tell that the front door was
            also the way in for the first time. There is no separate sign-up to build — the first
            Google or GitHub sign-in creates the account — but nothing on the page said so.
          */}
          <nav aria-label="Site" className="ml-auto flex items-center gap-1.5 sm:gap-3">
            <Link
              href="/projector"
              className="rounded-chip px-2 py-1.5 whitespace-nowrap text-ink/75 hover:text-ink sm:px-3"
              style={{ fontSize: "var(--text-xs)" }}
            >
              Live standings
            </Link>
            {signedIn ? (
              <Link
                href={destination}
                className="rounded-chip bg-panther px-3 py-1.5 font-semibold text-paper hover:bg-panther-deep"
                style={{ fontSize: "var(--text-xs)" }}
              >
                {enterLabel}
              </Link>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="rounded-chip px-2 py-1.5 whitespace-nowrap text-ink/75 hover:text-ink sm:px-3"
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  Log in
                </Link>
                <Link
                  href="/sign-up"
                  className="rounded-chip bg-panther px-3 py-1.5 font-semibold whitespace-nowrap text-paper hover:bg-panther-deep"
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  {/* The shorter label below `sm` keeps the CTA on one line in a 360 header. */}
                  <span className="sm:hidden">Create account</span>
                  <span className="hidden sm:inline">Create your account</span>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* --- hero ----------------------------------------------------------- */}
      <section className="relative overflow-hidden border-b border-rule-hair bg-paper">
        {/*
          The mark, oversized and bled off the right edge at low opacity. One image used as a field
          rather than as a logo — HackerRank runs a photograph here and we have exactly one brand
          asset, so it does the work. Kept under 6% so nothing on top of it approaches the
          DESIGN.md §7 contrast floor.
        */}
        <Image
          src="/brand/pt-panther.png"
          alt=""
          aria-hidden="true"
          width={275}
          height={235}
          priority
          className="pointer-events-none absolute -top-8 -right-24 hidden w-[34rem] max-w-none opacity-[0.055] md:block"
        />

        {/*
          Left-aligned copy with the product beside it, rather than a centred column with a
          watermark behind it.

          This is the change that separates a product page from a brochure, and it is the shape
          HackerRank uses: their hero runs copy on the left and a screenshot on the right, because
          what a visitor most wants to know is what the thing LOOKS like. The panel on the right is
          not a screenshot — it is the real team board, in markup, showing the arithmetic. That is
          also the honest choice of visual: teams ranked by a mean is the one thing here that is
          not HackerRank.

          Stacks below `lg`, copy first.
        */}
        {/*
          `motion-stagger` on the hero grid: the copy lands first, the board panel 35ms behind.
          A class here rather than a root template, because this page is outside both route
          groups (their templates never reach it) and a root `app/template.tsx` would nest a
          second rise inside the group templates on every navigation and animate the projector.
          The header above stays still - chrome does not arrive, content does, which is the same
          split the route groups make between layout and template.
        */}
        <div className="motion-stagger relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="motion-swap-in">
            <p
              className="text-ink/60 uppercase"
              style={{ fontSize: "var(--text-xs)", letterSpacing: "0.14em" }}
            >
              Park Tudor School
            </p>

            <h1
              className="mt-4 font-display font-bold"
              style={{
                fontSize: "clamp(2.2rem, 5.5vw, 3.4rem)",
                lineHeight: 1.08,
                textWrap: "balance",
              }}
            >
              Code with your team.
              <br />
              <span className="text-panther">Climb the standings.</span>
            </h1>

            <p
              className="mt-5 max-w-xl text-ink/75"
              style={{ fontSize: "var(--text-md)", textWrap: "pretty" }}
            >
              Park Tudor Coding Night is our team programming contest. Solve your assigned
              questions, work together on team problems, and follow every result on the live board.
            </p>

            {/* Two actions, one obviously primary. */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={signedIn ? destination : "/sign-in"}
                className="rounded-chip bg-panther px-5 py-2.5 font-semibold text-paper hover:bg-panther-deep"
                style={{ fontSize: "var(--text-sm)" }}
              >
                {signedIn ? enterLabel : "Sign in to compete"}
              </Link>
              <Link
                href="/projector"
                className="rounded-chip border border-rule-edge px-5 py-2.5 font-semibold hover:border-rule-firm hover:bg-ink/[0.03]"
                style={{ fontSize: "var(--text-sm)" }}
              >
                Watch the board
              </Link>
            </div>

            {!signedIn && (
              <p className="mt-4 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
                First time here? Signing in with Google or GitHub creates your account.
              </p>
            )}
          </div>

          <BoardPreview />
        </div>
      </section>

      {/* --- how the night works -------------------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
          How Coding Night works
        </h2>

        {/*
          Numbered because it IS a sequence — you cannot solve your set before an organizer has put
          you on a team. Numbering something that is merely a list is decoration; numbering this is
          information.
        */}
        {/* The four steps land 35ms apart, left to right - the stagger follows the reading
            order the numbering already asserts. */}
        <ol className="motion-stagger mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW.map((step) => (
            <li key={step.n} className="motion-swap-in rounded-panel border border-rule-hair bg-paper p-4">
              {/*
                Ink, not panther: DESIGN.md §2 names these step numbers as a place the accent was
                specifically dropped - the sequence differentiates by weight and size alone.
              */}
              <span
                className="numeric font-display font-bold text-ink/60"
                style={{ fontSize: "var(--text-lg)" }}
              >
                {step.n}
              </span>
              {/*
                `sm:min-h-12` baseline-locks the row: card 2's two-line title used to start its
                body 24px lower than its neighbours across a row that reads as a table. Only from
                `sm` up - stacked single-column cards have no shared baseline to hold.
              */}
              <h3
                className="mt-1 font-display font-bold sm:min-h-12"
                style={{ fontSize: "var(--text-sm)" }}
              >
                {step.title}
              </h3>
              <p className="mt-1.5 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* --- the closing band ------------------------------------------------ */}
      {/*
        One dark band before the footer, carrying the same action as the hero.

        A visitor who read the whole page is at the bottom of it with nothing to press, and
        scrolling back up to a button they have already passed is friction for no reason. Dark
        rather than another paper section so the page ends on a stop rather than trailing off.
      */}
      <section className="bg-ink text-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-12">
          <div>
            <h2 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
              Ready for Coding Night?
            </h2>
            <p className="mt-1.5 text-paper/80" style={{ fontSize: "var(--text-sm)" }}>
              {signedIn
                ? "Open the contest to see your team and assigned problems."
                : "Sign in to see your team, assigned problems, and submissions."}
            </p>
          </div>
          <Link
            href={signedIn ? destination : "/sign-in"}
            className="rounded-chip bg-panther px-5 py-2.5 font-semibold text-paper hover:bg-panther-deep"
            style={{ fontSize: "var(--text-sm)" }}
          >
            {signedIn ? enterLabel : "Sign in to compete"}
          </Link>
        </div>
      </section>

      {/* --- footer ---------------------------------------------------------- */}
      <footer className="mt-auto border-t border-rule-hair">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6">
          <span className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            Park Tudor Coding Night
          </span>
          {/* `py-1.5` lifts both targets from 19px to 31px, matching the header links (2.5.8). */}
          <Link
            href="/projector"
            className="py-1.5 text-ink/70 hover:text-ink"
            style={{ fontSize: "var(--text-xs)" }}
          >
            Live standings
          </Link>
          <Link
            href="/admin"
            className="ml-auto py-1.5 text-ink/70 hover:text-ink"
            style={{ fontSize: "var(--text-xs)" }}
          >
            Organizers
          </Link>
        </div>
      </footer>
    </div>
  );
}
