import type { Metadata } from "next";

import { SettingsView } from "@/components/contest/settings/SettingsView";

export const metadata: Metadata = {
  title: "Settings | Coding Night",
};

/**
 * `/settings` — the student's own profile: display name and picture.
 *
 * The page is thin; everything interactive lives in `SettingsView`, which reads and writes the
 * first-person `/api/me` routes. It sits in the competitor group so it inherits the same chrome,
 * the same back-to-Problems nav, and the same sign-in gate as every other student screen.
 */
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return <SettingsView />;
}
