import Link from "next/link";

/**
 * The one signed-out state every competitor screen shows.
 *
 * ## Why it exists
 *
 * There used to be four of these and they disagreed. `/contest` had a designed panel with a
 * button; `/contest/[slug]`, `/team` and `/submissions` each had their own sentence, two of them
 * reading **"Join the contest first"** — which is a `ForbiddenError` message from the route layer
 * (`lib/contest/viewer.ts`) rendered verbatim into `role="alert"`, in alert red, with nothing to
 * click. It names a flow that no longer exists: joining by code is gone, and a student signs in
 * with a provider and is put on a team by an organizer. So the two screens with the least to work
 * with told the student to do something impossible, in the styling reserved for errors.
 *
 * A signed-out visitor is not an error. It is the ordinary state of someone who has not signed in
 * yet, and the only useful thing to put on the screen is the way in.
 *
 * ## Why it lives under `lobby/`
 *
 * `LobbyView` already had the correct version of this state, so this is that copy extracted
 * rather than a fourth wording invented — the point of the change is that there is now exactly
 * one. Importing it from `submissions/` and `team/` is what makes the four screens agree.
 */

export interface SignInRequiredProps {
  /**
   * What this particular screen has to offer once signed in — "your team", "your submissions".
   * The heading and the button never vary; only this does, because a student on `/team` asked a
   * different question from a student on `/submissions`.
   */
  readonly what: string;
  /**
   * `1` where this panel IS the page — `/contest` and `/contest/[slug]` render nothing else when
   * anonymous, and a page whose only heading is an `h2` has no top of its outline. `2` where it
   * sits under a heading the page already drew, as on `/team`. Defaulted to the nested case so a
   * new caller cannot accidentally mint a second `h1`.
   */
  readonly level?: 1 | 2;
}

export function SignInRequired({ what, level = 2 }: SignInRequiredProps) {
  const Heading = level === 1 ? "h1" : "h2";

  return (
    // `role="status"`, not `role="alert"`. Nothing has gone wrong, and an alert on arrival is
    // announced as an interruption to a screen-reader user who simply is not signed in.
    <div role="status" className="max-w-md">
      <Heading className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
        You are not signed in
      </Heading>
      <p className="mt-2 text-ink/75" style={{ fontSize: "var(--text-sm)" }}>
        Sign in with your school Google or GitHub account to see {what}. The first sign-in creates
        your account, and an organizer puts you on a team.
      </p>
      <Link
        href="/sign-in"
        className="mt-4 inline-block rounded-chip bg-panther px-4 py-2 font-semibold text-paper transition-[background-color,transform] duration-[var(--motion-press)] hover:bg-panther-deep active:scale-[0.97]"
        style={{ fontSize: "var(--text-sm)" }}
      >
        Sign in to compete
      </Link>
    </div>
  );
}
