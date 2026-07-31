import Image from "next/image";
import Link from "next/link";

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

const GUARANTEES = [
  {
    title: "Every submission runs in its own sandbox",
    body: "A throwaway container with no network, a read-only filesystem, no privileges, and caps on memory, processes, CPU and disk. Nothing you write can reach anything else.",
  },
  {
    title: "One scoring rule, in one place",
    body: "Your team's score is every member's points divided by the number of people on the team, plus side activities. Integer arithmetic throughout — no float ever decides a placing.",
  },
  {
    title: "The board can be replayed",
    body: "Standings recompute from the raw submission log to byte-identical output. A disputed result gets shown rather than argued about.",
  },
] as const;

export default function Home() {
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

          <nav aria-label="Site" className="ml-auto flex items-center gap-3">
            <Link
              href="/projector"
              className="rounded px-3 py-1.5 text-ink/75 hover:text-ink"
              style={{ fontSize: "var(--text-xs)" }}
            >
              Live standings
            </Link>
            <Link
              href="/sign-in"
              className="rounded bg-panther px-3 py-1.5 font-semibold text-paper hover:bg-panther-deep"
              style={{ fontSize: "var(--text-xs)" }}
            >
              Sign in
            </Link>
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

        <div className="relative mx-auto w-full max-w-3xl px-4 py-16 text-center sm:py-24">
          <p
            className="text-ink/60 uppercase"
            style={{ fontSize: "var(--text-xs)", letterSpacing: "0.14em" }}
          >
            Park Tudor School
          </p>

          <h1
            className="mt-4 font-display font-bold"
            style={{ fontSize: "clamp(2.2rem, 6vw, 3.4rem)", lineHeight: 1.1, textWrap: "balance" }}
          >
            Ninety minutes.
            <br />
            <span className="text-panther">One board.</span>
          </h1>

          <p
            className="mx-auto mt-5 max-w-xl text-ink/75"
            style={{ fontSize: "var(--text-md)", textWrap: "balance" }}
          >
            Coding Night is Park Tudor&rsquo;s programming contest. Teams solve problems against a
            live judge, and the room watches the standings move.
          </p>

          {/* Two actions, one obviously primary. */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/sign-in"
              className="rounded bg-panther px-5 py-2.5 font-semibold text-paper hover:bg-panther-deep"
              style={{ fontSize: "var(--text-sm)" }}
            >
              Sign in to compete
            </Link>
            <Link
              href="/projector"
              className="rounded border border-ink/25 px-5 py-2.5 font-semibold hover:border-ink/50 hover:bg-ink/[0.03]"
              style={{ fontSize: "var(--text-sm)" }}
            >
              Watch the board
            </Link>
          </div>

          <p className="mt-4 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            Google or GitHub. No code to type, nothing to install.
          </p>
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
