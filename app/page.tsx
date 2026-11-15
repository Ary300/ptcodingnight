import Image from "next/image";
import Link from "next/link";

import { viewerFromCookies } from "@/lib/contest/viewer";

/**
 * The front page.
 *
 * Rewritten on 2026-11-15 because the organizers said the old one read as machine-made, and they
 * were right about why: an all-caps label over a headline with one phrase in red, four numbered
 * cards, a two-by-two feature grid and a dark "Ready?" banner is the shape every generated landing
 * page has. This version says three things a student needs, in the order they need them: what the
 * night is and how to get in, what happens at each time, and who built it.
 *
 * The schedule is the times from the teacher's email. If the night moves, change them here.
 */

const SCHEDULE = [
  { time: "6:30", text: "Pizza. Find your team." },
  { time: "7:00", text: "Coding starts. For the first half hour you work on your own problems." },
  { time: "7:30", text: "The team problems open." },
  { time: "8:00", text: "The scoreboard freezes, so nobody knows who is winning." },
  { time: "8:15", text: "Coding stops and we clean up the rooms." },
  { time: "8:25", text: "Kahoot." },
  { time: "8:35", text: "Awards. You’ll be out by 8:45." },
] as const;

/**
 * Real people with real photos, so the photo is content: `alt` names the person. No pronouns,
 * because nobody has told us anyone's, and the sentences read fine without them.
 */
const PEOPLE = [
  {
    name: "Sameer Zaidi",
    photo: "/people/sameer-zaidi.jpg",
    body: "President of the CS Club. Sameer organizes Coding Night, puts the teams together and picks the problems.",
  },
  {
    name: "Navraj Brar",
    photo: "/people/navraj.jpg",
    body: "President of the CS Club. Runs the club with Sameer.",
  },
  {
    name: "Aryav Das",
    photo: "/people/aryav-das-2026.jpg",
    body: "Officer in the CS Club. Built this website.",
  },
] as const;

const QUESTIONS = [
  {
    q: "Do I need an account?",
    a: "No. Type the code from your slip and you’re in, already on your team.",
  },
  {
    q: "What languages can I use?",
    a: "Python, Java, C, C++, JavaScript or Go. Most problems start you off with the code that reads the input, so you only write the part that solves it.",
  },
  {
    q: "I haven’t done much coding.",
    a: "That’s fine. Everyone gets one easy problem, and you also get a puzzle that doesn’t need any code, like decoding binary. Solving it adds points for your team.",
  },
  {
    q: "How is the team score worked out?",
    a: "We add up everyone’s problem points and divide by the number of people on the team, so a team of three isn’t behind a team of four. Puzzles and the Kahoot add points on top of that.",
  },
] as const;

export default async function Home() {
  /*
    A signed-in student who comes back to `/` gets sent into the contest, and an organizer into
    the console, instead of being asked for a code they have already typed.
  */
  const viewer = await viewerFromCookies();
  const signedIn = viewer.kind !== "anonymous";
  const destination = viewer.kind === "admin" ? "/admin" : "/contest";
  const primaryLabel = !signedIn
    ? "Enter your join code"
    : viewer.kind === "admin"
      ? "Open the organizer console"
      : "Go to the contest";
  const primaryHref = signedIn ? destination : "/join";

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <header className="border-b border-rule-hair">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
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
              Park Tudor Coding Night
            </span>
          </Link>
          <nav aria-label="Site" className="ml-auto flex flex-wrap items-center gap-2 sm:gap-3">
            <Link
              href="/projector"
              className="rounded-chip px-2 py-1.5 whitespace-nowrap text-ink/75 hover:text-ink"
              style={{ fontSize: "var(--text-xs)" }}
            >
              Standings
            </Link>
            <Link
              href={primaryHref}
              className="rounded-chip bg-panther px-3 py-1.5 font-semibold whitespace-nowrap text-paper hover:bg-panther-deep"
              style={{ fontSize: "var(--text-xs)" }}
            >
              {primaryLabel}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* What it is and how to get in, beside what happens when. */}
        <section className="mx-auto grid w-full max-w-5xl gap-12 px-4 pt-14 pb-16 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16">
          <div>
            <Image
              src="/brand/pt-panther.png"
              alt="Park Tudor Panthers logo"
              width={275}
              height={235}
              priority
              className="h-20 w-auto"
            />
            <h1
              className="mt-6 font-display font-bold"
              style={{ fontSize: "clamp(2.2rem, 5.5vw, 3.4rem)", lineHeight: 1.08 }}
            >
              Park Tudor Coding Night
            </h1>
            <p
              className="mt-5 max-w-[56ch] text-ink/80"
              style={{ fontSize: "var(--text-md)", lineHeight: 1.6 }}
            >
              The Computer Science Club&rsquo;s programming contest. You&rsquo;re on a team of up
              to four. For the first half hour everyone works on their own problems, and after
              that the team problems open and you can work on them together. Bring a laptop.
            </p>
            <p className="mt-3 max-w-[56ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
              Your join code is on the slip you get at the door.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={primaryHref}
                className="rounded-chip bg-panther px-5 py-2.5 font-semibold text-paper hover:bg-panther-deep"
                style={{ fontSize: "var(--text-sm)" }}
              >
                {primaryLabel}
              </Link>
              <Link
                href="/projector"
                className="rounded-chip border border-rule-edge px-5 py-2.5 font-semibold hover:border-rule-firm"
                style={{ fontSize: "var(--text-sm)" }}
              >
                See the standings
              </Link>
            </div>
          </div>

          {/*
            The schedule IS a sequence, so it is an ordered list with the clock time as its marker.
            Times in JetBrains Mono, the face this site keeps for numbers people line up by eye.
          */}
          <div className="lg:pt-24">
            <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
              How the night goes
            </h2>
            <ol className="mt-4 border-l-2 border-panther">
              {SCHEDULE.map((item) => (
                <li
                  key={item.time}
                  className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 py-2 pl-4"
                >
                  <span
                    className="numeric font-semibold text-ink"
                    style={{ fontSize: "var(--text-sm)" }}
                  >
                    {item.time}
                  </span>
                  <span className="text-ink/80" style={{ fontSize: "var(--text-sm)" }}>
                    {item.text}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-rule-hair bg-ink/[0.03]">
          <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <h2 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
                Built by Park Tudor students
              </h2>
              <p
                className="mt-3 max-w-[56ch] text-ink/80"
                style={{ fontSize: "var(--text-sm)", lineHeight: 1.65 }}
              >
                Coding Night used to run on HackerRank, and someone added up the team scores in a
                spreadsheet afterward. This year the CS Club built its own site. It checks your
                code when you submit and works out the team scores, so nobody has to do the math by
                hand at the end.
              </p>
              <p className="mt-3 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
                If something breaks during the contest, come find one of us.
              </p>
            </div>

            <ul className="flex flex-col gap-5">
              {PEOPLE.map((person) => (
                <li key={person.name} className="flex items-start gap-4">
                  <Image
                    src={person.photo}
                    alt={person.name}
                    width={400}
                    height={400}
                    sizes="72px"
                    className="h-[72px] w-[72px] shrink-0 rounded-panel object-cover"
                  />
                  <div className="min-w-0">
                    <h3 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
                      {person.name}
                    </h3>
                    <p className="mt-1 text-ink/75" style={{ fontSize: "var(--text-sm)" }}>
                      {person.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-14">
          <h2 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
            Before you come
          </h2>
          <dl className="mt-6 grid gap-x-16 gap-y-7 md:grid-cols-2">
            {QUESTIONS.map((item) => (
              <div key={item.q} className="max-w-[52ch]">
                <dt className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
                  {item.q}
                </dt>
                <dd className="mt-1.5 text-ink/75" style={{ fontSize: "var(--text-sm)" }}>
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="mt-auto border-t border-rule-hair">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6">
          <span
            className="flex items-center gap-2 text-ink/70"
            style={{ fontSize: "var(--text-xs)" }}
          >
            <Image
              src="/brand/pt-panther.png"
              alt=""
              aria-hidden="true"
              width={275}
              height={235}
              className="h-5 w-auto"
            />
            Made by the Park Tudor Computer Science Club
          </span>
          <Link
            href="/projector"
            className="py-1.5 text-ink/70 hover:text-ink"
            style={{ fontSize: "var(--text-xs)" }}
          >
            Standings
          </Link>
          {/* Organizers also reach the passcode page from the foot of /join. */}
          <Link
            href="/sign-in"
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
