import Image from "next/image";
import Link from "next/link";

import { viewerFromCookies } from "@/lib/contest/viewer";

/**
 * The front door — `https://ptcodingnight.com/`.
 *
 * ## What this is copying, and what it is not
 *
 * HackerRank's marketing page is a large centred hero with one word of the headline in the accent
 * colour, a muted subhead, two buttons side by side, and a band of proof underneath. That shape is
 * worth taking: it answers "what is this" in one screen and gives exactly one obvious next action.
 *
 * What is not worth taking is their content model. They sell to companies, so their proof is a
 * logo wall. This page's visitor is a student ten minutes before a contest, or a parent following
 * a link, or an organizer. The proof is therefore what the platform actually guarantees — a
 * sandbox, one scoring rule, a replayable board — because those are the claims someone might
 * reasonably doubt.
 *
 * ## Why the ground is tinted and the cards are paper
 *
 * Everything used to sit flat on `--paper`, which is why it read as a document rather than as a
 * product. Cards on a slightly darker ground is the device that makes HackerRank's app screens
 * feel built; it costs one background colour and it does more for the page than any amount of
 * additional copy.
 */

const HOW = [
  {
    n: "1",
    title: "Sign in",
    body: "Google or GitHub. The first sign-in creates your account. There is no code to type and nothing to install.",
  },
  {
    n: "2",
    title: "An organizer puts you on a team",
    body: "Teams are made from the roster on the night. Team size is the divisor in your team's score, so a roster is a scoring input and only organizers touch it.",
  },
  {
    n: "3",
    title: "Solve your set",
    body: "Every player gets their own problem set, plus the group problems the whole team works. Run the samples as often as you like; only a submission counts.",
  },
  {
    n: "4",
    title: "Watch the board",
    body: "A verdict comes back in seconds and the projector updates. The board shows the arithmetic, not just the total.",
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

const GUARANTEES = [
  {
    title: "Every submission runs in its own sandbox",
    body: "A throwaway container with no network, a read-only filesystem, no privileges, and caps on memory, processes, CPU and disk. Nothing you write can reach anything else.",
  },
  {
    title: "One scoring rule, in one place",
    body: "Your team's score is every member's points divided by the number of people on the team, plus side activities. Integer arithmetic throughout: no float ever decides a placing.",
  },
  {
    title: "The board can be replayed",
    body: "Standings recompute from the raw submission log to byte-identical output. A disputed result gets shown rather than argued about.",
  },
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
    <div className="overflow-hidden rounded-lg border border-ink/15 bg-paper shadow-[0_1px_2px_rgba(26,6,6,0.06),0_8px_24px_-12px_rgba(26,6,6,0.25)]">
      <div className="flex items-center justify-between border-b border-ink/12 bg-ink px-4 py-2.5 text-paper">
        <span className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
          Team standings
        </span>
        {/* The live dot, and the word beside it. Colour is never the only channel (DESIGN.md §3). */}
        <span className="flex items-center gap-1.5 text-paper/85" style={{ fontSize: "var(--text-xs)" }}>
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--color-gold)" }}
          />
          Live
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: "var(--text-xs)" }}>
          <caption className="px-4 pt-3 text-left text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            An example board. Score is the team&rsquo;s points divided by its size, plus side
            activities.
          </caption>
          <thead>
            <tr className="border-b border-ink/12 text-ink/60">
              <th scope="col" className="px-3 py-2 text-left font-semibold">
                #
              </th>
              <th scope="col" className="w-full px-3 py-2 text-left font-semibold">
                Team
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
              <th scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {BOARD_PREVIEW.map((row) => (
              <tr key={row.team} className="border-b border-ink/8 last:border-b-0">
                <td className="numeric px-3 py-2.5 text-ink/70">{row.rank}</td>
                <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{row.team}</td>
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
                <td className="numeric px-3 py-2.5 text-right font-bold">{row.score}</td>
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
      <header className="border-b border-ink/10 bg-paper">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
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
            <span className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
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
              className="rounded px-2 py-1.5 text-ink/75 hover:text-ink sm:px-3"
              style={{ fontSize: "var(--text-xs)" }}
            >
              Live standings
            </Link>
            {signedIn ? (
              <Link
                href={destination}
                className="rounded bg-panther px-3 py-1.5 font-semibold text-paper hover:bg-panther-deep"
                style={{ fontSize: "var(--text-xs)" }}
              >
                {enterLabel}
              </Link>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="rounded px-2 py-1.5 text-ink/75 hover:text-ink sm:px-3"
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  Log in
                </Link>
                <Link
                  href="/sign-in"
                  className="rounded bg-panther px-3 py-1.5 font-semibold text-paper hover:bg-panther-deep"
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  Create your account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* --- hero ----------------------------------------------------------- */}
      <section className="relative overflow-hidden border-b border-ink/10 bg-paper">
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
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div>
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
              Ninety minutes.
              <br />
              <span className="text-panther">One board.</span>
            </h1>

            <p
              className="mt-5 max-w-xl text-ink/75"
              style={{ fontSize: "var(--text-md)", textWrap: "pretty" }}
            >
              Coding Night is Park Tudor&rsquo;s programming contest. Teams solve problems against a
              live judge, and the room watches the standings move.
            </p>

            {/* Two actions, one obviously primary. */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={signedIn ? destination : "/sign-in"}
                className="rounded bg-panther px-5 py-2.5 font-semibold text-paper hover:bg-panther-deep"
                style={{ fontSize: "var(--text-sm)" }}
              >
                {signedIn ? enterLabel : "Sign in to compete"}
              </Link>
              <Link
                href="/projector"
                className="rounded border border-ink/25 px-5 py-2.5 font-semibold hover:border-ink/50 hover:bg-ink/[0.03]"
                style={{ fontSize: "var(--text-sm)" }}
              >
                Watch the board
              </Link>
            </div>

            {!signedIn && (
              <p className="mt-4 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
                Google or GitHub. No code to type, nothing to install.
              </p>
            )}
          </div>

          <BoardPreview />
        </div>
      </section>

      {/* --- how the night works -------------------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
          How the night works
        </h2>

        {/*
          Numbered because it IS a sequence — you cannot solve your set before an organizer has put
          you on a team. Numbering something that is merely a list is decoration; numbering this is
          information.
        */}
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW.map((step) => (
            <li key={step.n} className="rounded border border-ink/12 bg-paper p-4">
              <span
                className="numeric font-display font-bold text-panther"
                style={{ fontSize: "var(--text-lg)" }}
              >
                {step.n}
              </span>
              <h3 className="mt-1 font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
                {step.title}
              </h3>
              <p className="mt-1.5 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* --- what the platform guarantees ----------------------------------- */}
      <section className="border-t border-ink/10 bg-paper">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <h2 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
            What it guarantees
          </h2>
          <p className="mt-1 max-w-prose text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            This replaced a spreadsheet that once got a team&rsquo;s score wrong by 31.25 points.
            These are the three things that stop it happening again.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {GUARANTEES.map((item) => (
              <div key={item.title} className="rounded border-l-2 border-panther bg-ink/[0.03] p-4">
                <h3 className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
                  {item.title}
                </h3>
                <p className="mt-1.5 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
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
              The room is already scoring.
            </h2>
            <p className="mt-1.5 text-paper/80" style={{ fontSize: "var(--text-sm)" }}>
              Sign in with your school account. An organizer puts you on a team when you arrive.
            </p>
          </div>
          <Link
            href={signedIn ? destination : "/sign-in"}
            className="rounded bg-panther px-5 py-2.5 font-semibold text-paper hover:bg-panther-deep"
            style={{ fontSize: "var(--text-sm)" }}
          >
            {signedIn ? enterLabel : "Sign in to compete"}
          </Link>
        </div>
      </section>

      {/* --- footer ---------------------------------------------------------- */}
      <footer className="mt-auto border-t border-ink/10">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6">
          <span className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            Park Tudor Coding Night
          </span>
          <Link
            href="/projector"
            className="text-ink/70 hover:text-panther"
            style={{ fontSize: "var(--text-xs)" }}
          >
            Live standings
          </Link>
          <Link
            href="/admin"
            className="ml-auto text-ink/70 hover:text-panther"
            style={{ fontSize: "var(--text-xs)" }}
          >
            Organizers
          </Link>
        </div>
      </footer>
    </div>
  );
}
