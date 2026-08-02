/**
 * Remounts on every navigation within the competitor group, INCLUDING the browser's back button,
 * which a layout does not. That remount is the whole reason this file exists: it re-runs the
 * `motion-swap-in` rise on the incoming page, so arriving anywhere (forward or back) reads as the
 * page landing rather than the screen being swapped in the same frame.
 *
 * Transform-only, like every entrance in this codebase: a fading wrapper would drag every alpha'd
 * token inside it below its contrast floor for the length of the animation (measured at 4.16:1
 * once; G9 caught it). The rise is the whole job. Reduced motion flattens it globally.
 */
export default function CompetitorTemplate({ children }: { children: React.ReactNode }) {
  return <div className="motion-swap-in">{children}</div>;
}
