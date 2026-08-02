/**
 * The arrival rise for the tab panels inside one contest: setup, problems, sets, live, awards.
 *
 * A template re-keys when its IMMEDIATE child segment changes. The console-wide template at
 * `app/(admin)/admin/template.tsx` sees all of a contest's tabs as the one `contests` segment, so
 * a hop from Setup to Problems never re-keys it and the arriving panel would land in the same
 * frame with no entrance (measured in a live browser before this file existed: zero animation
 * starts on a client-side arrival at the setup page). This template's children ARE the tab
 * segments, so every tab switch re-runs the rise, including via the browser's back button.
 *
 * It sits INSIDE the contest layout, below the contest header and tab strip, so the chrome holds
 * still and only the arriving panel moves: the chrome persists, the content arrives.
 *
 * `router.refresh()` (which the setup checklist and state actions call after every action) is not
 * a navigation and does not re-key a template, so in-place data refreshes stay still.
 *
 * Transform-only, like every entrance in this codebase: a fading wrapper would drag every alpha'd
 * token inside it below its contrast floor for the length of the animation (measured at 4.16:1
 * once; G9 caught it). The rise is the whole job. Reduced motion flattens it globally.
 */
export default function ContestTabTemplate({ children }: { children: React.ReactNode }) {
  return <div className="motion-swap-in">{children}</div>;
}
