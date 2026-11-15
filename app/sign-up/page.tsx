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
 * `POST /api/auth/signup` is untouched. It is exercised by the API specs and is how the practice
 * arena was reached; see `docs/TODO.md` T17 for what that means now that no screen calls it.
 */
export default function SignUpPage(): never {
  redirect("/join");
}
