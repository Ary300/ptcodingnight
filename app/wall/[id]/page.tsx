import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CodeWall } from "@/components/admin/CodeWall";
import { signInErrorLocation } from "@/lib/contest/sign-in-errors";
import { isAdmin, viewerFromCookies } from "@/lib/contest/viewer";

/**
 * `/wall/{contestId}` — the join codes, on the projector.
 *
 * The organizer asked to put the codes on the same screen the standings go on, so a room of
 * students can read their own code instead of queueing at one desk for a printed slip.
 *
 * ## Why it is NOT under `/admin`
 *
 * It was, and it did not work. `/admin/**` wraps every page in an entrance animation, and a
 * `transform` on an ancestor makes `position: fixed` resolve against that ancestor instead of the
 * viewport — so a screen meant to fill a projector rendered clipped, mid-page, under a breadcrumb
 * and an h1. A projected surface also has no business showing our navigation to forty students.
 *
 * So it lives beside `/projector` in shape, and keeps the admin gate by DOING THE CHECK ITSELF.
 * That check is not optional: this page prints a roster's worth of live credentials, and the layout
 * gate that covers the rest of the console does not reach here.
 *
 * `/projector` is public and this is not, so it does not go in that route group either. Anybody
 * reading this file later: the redirect below is the only thing standing between a URL and every
 * code in the contest.
 */

export const metadata: Metadata = {
  title: "Join codes | Coding Night",
  // A wall of credentials must never be indexed, cached by a crawler, or previewed in a link.
  robots: { index: false, follow: false },
};

export default async function CodeWallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await viewerFromCookies();
  if (!isAdmin(viewer)) {
    redirect(signInErrorLocation("organizer_required"));
  }

  const { id } = await params;
  return <CodeWall contestId={id} />;
}
