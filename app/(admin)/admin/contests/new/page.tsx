import { Crumbs } from "@/components/ui";
import { ContestBuilder } from "@/components/admin/ContestBuilder";

/**
 * Create a contest.
 *
 * ## Why creating has its own URL now
 *
 * `/admin/contest` was a form with no list beside it and nothing saying whether it created or
 * edited. On success it stayed filled with a live "Create contest" button, so pressing it twice
 * made two identical contests — which is how the dev database ended up with two rows both called
 * "Dup Test Night", four seconds apart, in the picker an organizer then had to choose from.
 *
 * `/admin` is the list; this is the one door off it that makes a new row; and creating now ENDS
 * inside the contest it made rather than on the form that made it.
 */
export default function NewContestPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Crumbs trail={[{ href: "/admin", label: "Contests" }, { label: "New contest" }]} />
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          New contest
        </h1>
        <p className="max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Set the window, the divisions, the preset and the freeze before the night, so nothing here
          is being decided while students are waiting. Everything else — the problems, the roster,
          the side activities — is a tab of the contest once it exists.
        </p>
      </header>

      <ContestBuilder />
    </div>
  );
}
