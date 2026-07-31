"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, type ReactNode } from "react";

import { Countdown } from "./Countdown";
import type { StandingsResponse } from "@/lib/schemas/api";
import { contestApi, isStubBackend } from "./data/backend";
import { clearParticipant, useParticipant } from "./data/participant";
import { useResource } from "./data/useResource";

/**
 * The frame every competitor screen sits in.
 *
 * The skip link is first in the DOM and the first thing Tab reaches. G9 requires the submit
 * flow to complete keyboard-only, and a nav a student has to tab past on every page is the
 * kind of thing that makes "keyboard-only" technically true and practically useless.
 */

const NAV = [
  { href: "/contest", label: "Problems" },
  { href: "/submissions", label: "My submissions" },
] as const;

function StubBanner() {
  return (
    <p
      role="status"
      className="bg-ink px-4 py-1.5 text-center text-paper"
      style={{ fontSize: "var(--text-xs)" }}
    >
      <span style={{ color: "var(--color-gold)" }}>Demo data.</span> This page is wired to{" "}
      <span className="numeric">{contestApi.label}</span>, not a live contest. Nothing here is
      scored.
    </p>
  );
}

export function CompetitorChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const participant = useParticipant();

  /**
   * Not fetched until the student is actually in a contest.
   *
   * This chrome wraps the whole competitor route group, `/join` included — and `/join` is by
   * definition the page reached before joining, where a contest-scoped read has no contest to
   * scope to. Asking anyway produced a request that could only fail, on the first screen a
   * student sees.
   *
   * Keyed on `participant.status` rather than read once, so the countdown appears the moment the
   * join completes instead of after a reload.
   */
  const joined = participant.status === "joined";
  const loadStandings = useCallback(
    (): Promise<StandingsResponse | null> => (joined ? contestApi.getStandings() : Promise.resolve(null)),
    [joined],
  );
  const standings = useResource(loadStandings);

  const leave = useCallback(() => {
    clearParticipant();
    window.location.assign("/join");
  }, []);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
      >
        Skip to main content
      </a>

      {isStubBackend && <StubBanner />}

      {/*
        A solid dark bar with the mark at the left and the nav beside it — HackerRank's chrome,
        which is the shape every student in the room has already used.

        --ink rather than --panther for the bar itself. Red is the ACCENT here: the active-tab
        underline and the primary buttons. A full-width saturated red bar makes the red mean
        "chrome" instead of "this is the important thing", and DESIGN.md §2 pins --panther to
        identity and emphasis rather than to large fills.
      */}
      <header className="bg-ink text-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-2.5">
          <Link href="/contest" className="flex items-center gap-2.5">
            <Image
              src="/brand/pt-panther.png"
              alt=""
              width={275}
              height={235}
              aria-hidden="true"
              className="h-8 w-auto"
            />
            <span className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
              Coding Night
            </span>
          </Link>

          <nav aria-label="Competitor" className="flex gap-4">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "border-b-2 border-panther pb-0.5 font-semibold text-paper"
                      : "border-b-2 border-transparent pb-0.5 text-paper/75 hover:text-paper"
                  }
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/*
            `min-w-0` on both flex boxes, and the name truncates.

            A flex item's default `min-width: auto` refuses to shrink below its content, so a long
            display name pushed this whole block past the viewport rather than wrapping: measured
            at 385px inside a 360px phone, which puts the Submit button off-screen behind a
            sideways scroll (DESIGN.md §7, PRD §11 — students are on phones). Display names are
            student-supplied and allowed up to 40 characters, so this is the normal case rather
            than an edge one.
          */}
          <div className="ml-auto flex min-w-0 items-center gap-4">
            {standings.status === "ready" && standings.data !== null && (
              <Countdown endsAt={standings.data.endsAt} />
            )}

            {participant.status === "joined" && (
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="min-w-0 truncate text-paper/75"
                  title={participant.participant.displayName}
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  {participant.participant.displayName}
                </span>
                <button
                  type="button"
                  onClick={leave}
                  className="shrink-0 text-paper/75 underline underline-offset-2 hover:text-paper"
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  Leave
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/*
        `/join` opts out of the centred column.

        It is the split-screen entry page, and HackerRank's equivalent runs edge to edge — a dark
        brand panel inset inside a 1152px column with 16px of paper showing around it reads as a
        card that failed to load rather than as half a screen. Every other competitor route keeps
        the measure, because a statement set in a full-width line is unreadable.
      */}
      <main
        id="main"
        className={
          pathname === "/join"
            ? "w-full flex-1"
            : "mx-auto w-full max-w-6xl flex-1 px-4 py-6"
        }
      >
        {children}
      </main>
    </>
  );
}
