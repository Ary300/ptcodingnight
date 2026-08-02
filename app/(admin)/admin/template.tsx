/**
 * The arrival rise for the organizer console, at the level where it actually re-runs.
 *
 * A template re-keys when its IMMEDIATE child segment changes, and only then. This file used to
 * live one level up, at the (admin) route group, where its immediate child is the single `admin`
 * segment that every console URL shares. Measured in a live browser: the group-level wrapper's
 * animation ran once per full document load and never again, so every client-side navigation
 * inside the console (Contests to a contest's setup, setup back to Contests, over to the problem
 * bank) landed its page in the same frame with no entrance at all. The same measurement on the
 * competitor group, whose children are four different segments, showed the wrapper remounting and
 * the rise re-running on every tab hop, which is what this file was always believed to do here.
 *
 * At this level the immediate children are the console's sections (the Contests page, `contests`,
 * `problems`, `teams`, `side-activities`), so moving between sections re-runs the rise, including
 * via the browser's back button. Movement WITHIN a contest is covered by the sibling template at
 * `contests/[id]/template.tsx`, whose children are the tab segments. Full-page loads behave as
 * before: this wrapper covers every console URL, exactly as the group-level one did.
 *
 * Transform-only, like every entrance in this codebase: a fading wrapper would drag every alpha'd
 * token inside it below its contrast floor for the length of the animation (measured at 4.16:1
 * once; G9 caught it). The rise is the whole job. Reduced motion flattens it globally.
 */
export default function AdminSectionTemplate({ children }: { children: React.ReactNode }) {
  return <div className="motion-swap-in">{children}</div>;
}
