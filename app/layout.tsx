import type { Metadata } from "next";

import "./globals.css";

/**
 * Typography is deliberately left at system defaults until docs/DESIGN.md names a display,
 * body, and monospace face at Phase 4a.
 *
 * The scaffold's `next/font/google` import was removed for two reasons: PRD §11 asks for
 * type that carries the personality rather than a framework default, and a Google Fonts
 * fetch is a build-time network dependency in a project whose defining constraint is that
 * the night has no internet.
 */
export const metadata: Metadata = {
  title: "Park Tudor Coding Night",
  description:
    "Contest platform for Park Tudor's Coding Night — live judging, scoring, and leaderboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
