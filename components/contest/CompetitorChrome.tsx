"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, type ReactNode } from "react";

import { Countdown } from "./Countdown";
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

  const loadStandings = useCallback(() => contestApi.getStandings(), []);
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

      <header className="border-b border-ink/15">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/contest" className="flex items-center gap-3">
            <Image
              src="/brand/pt-crest-outline.svg"
              alt=""
              width={32}
              height={32}
              aria-hidden="true"
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
                      ? "border-b-2 border-panther pb-0.5 font-semibold text-ink"
                      : "border-b-2 border-transparent pb-0.5 text-ink/70 hover:text-ink"
                  }
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            {standings.status === "ready" && <Countdown endsAt={standings.data.endsAt} />}

            {participant.status === "joined" && (
              <div className="flex items-center gap-2">
                <span className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
                  {participant.participant.displayName}
                </span>
                <button
                  type="button"
                  onClick={leave}
                  className="text-ink/60 underline underline-offset-2 hover:text-panther"
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  Leave
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </>
  );
}
