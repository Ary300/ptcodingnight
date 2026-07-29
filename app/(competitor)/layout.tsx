import type { ReactNode } from "react";

import { CompetitorChrome } from "@/components/contest/CompetitorChrome";

/**
 * The competitor route group: `/join`, `/contest`, `/contest/[slug]`, `/submissions`.
 *
 * A route group rather than a path segment, so the URLs a student types on a phone stay
 * short. The chrome itself is a client component because it reads the tab-local participant
 * and ticks the contest clock; this layout stays a server component so the group is not
 * needlessly client-rendered above that point.
 */
export default function CompetitorLayout({ children }: { children: ReactNode }) {
  return <CompetitorChrome>{children}</CompetitorChrome>;
}
