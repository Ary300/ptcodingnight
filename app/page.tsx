import Image from "next/image";
import Link from "next/link";

/**
 * The front door — `https://ptcodingnight.com/`.
 *
 * This replaced a placeholder reading "Contest platform — under construction" and "the judge, the
 * scoring engine, and the contest UI are not built yet". All three have been built and gated for
 * some time; the page had simply never been revisited, so the first sentence the school would
 * have read on its own contest site was a statement that the site did not work.
 *
 * It stays short on purpose. Its whole job is to route three kinds of visitor — a student with a
 * code, a room looking for the board, an organizer — and PRD §11 is explicit that this must not
 * become a generic dashboard.
 */

const DESTINATIONS = [
  {
    href: "/join",
    title: "Join the contest",
    body: "You need the code on the board at the front of the room. No account, no password.",
    primary: true,
  },
  {
    href: "/projector",
    title: "Live standings",
    body: "The team board, sized for a projector. It says in words whether it is live or frozen.",
    primary: false,
  },
  {
    href: "/sign-in",
    title: "Organizer sign-in",
    body: "Run the contest: start, freeze, override a verdict, enter side points, export results.",
    primary: false,
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-4 py-16">
      <header className="flex items-center gap-5">
        <Image
          src="/brand/pt-panther.png"
          alt=""
          aria-hidden="true"
          width={275}
          height={235}
          priority
          className="h-20 w-auto"
        />
        <div>
          <h1 className="font-display font-bold" style={{ fontSize: "var(--text-2xl)" }}>
            Coding Night
          </h1>
          <p className="mt-1 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            Park Tudor&rsquo;s programming contest.
          </p>
        </div>
      </header>

      <p className="max-w-prose text-ink/80" style={{ fontSize: "var(--text-sm)" }}>
        Teams solve problems against a live judge. Every submission runs in its own sandbox, every
        score is computed one way and can be replayed from the raw log, and the board on the wall
        is the same board you are looking at.
      </p>

      <ul className="flex flex-col gap-3">
        {DESTINATIONS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={
                item.primary
                  ? "block rounded border-l-4 border-panther bg-ink/[0.03] p-4 hover:bg-ink/[0.06]"
                  : "block rounded border-l-4 border-ink/15 p-4 hover:bg-ink/[0.04]"
              }
            >
              <span className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
                {item.title}
              </span>
              <span className="mt-1 block text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
                {item.body}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
