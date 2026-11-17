import { redirect } from "next/navigation";

/**
 * `/sign-up` no longer exists as a screen.
 *
 * The organizer's instruction on 2026-11-15: students have no accounts, so there is nothing to
 * create. The route stays as a redirect rather than a 404 because the old page was linked from
 * `/sign-in` for months and a bookmark or a texted link may still carry it; a student following
 * one should land on the door that works, with the slip in their hand, rather than on "This page
 * could not be found".
 *
 * `POST /api/auth/signup` is closed too: it answers 410 with a sentence pointing to /join, because
 * it enrolled any new account into the real contest once it was SCHEDULED.
 */
export default function SignUpPage(): never {
  redirect("/join");
}
