"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Countdown } from "./Countdown";
import { UserMenu } from "./UserMenu";
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

/*
  `/team` was built, tested and routed, and was reachable only by typing the URL — it was in no
  nav anywhere. Coding Night ranks TEAMS (PRD §6.1), so the screen showing a student their team's
  score, and the division that produced it, is not a secondary view to be found by guessing.
*/
const NAV = [
  { href: "/contest", label: "Problems" },
  { href: "/team", label: "My team" },
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

  /*
    The viewer's team, for the menu's highlighted slot.

    Fetched ONCE rather than polled. It is chrome, not a live score: a team changes when an
    organizer moves somebody, which is rare and already forces a reload of the screens that
    matter. Polling it on every competitor page would add a request per student per interval for
    a line of text, and the judge queue is the thing that must not be starved on the night.
  */
  const [team, setTeam] = useState<{ name: string } | null>(null);
  // The account id and the avatar's version, for the menu's picture. Read from the same session
  // response as the team, so the picture and the team name never cost two requests.
  const [account, setAccount] = useState<{ userId: string | null; avatarVersion: string | null }>({
    userId: null,
    avatarVersion: null,
  });
  useEffect(() => {
    if (!joined) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const body: unknown = await response.json();
        const data =
          typeof body === "object" && body !== null && "data" in body
            ? (body as { data: Record<string, unknown> }).data
            : null;
        if (data === null) return;
        const name = data.teamName;
        if (typeof name === "string" && name.length > 0) setTeam({ name });
        setAccount({
          userId: typeof data.userId === "string" ? data.userId : null,
          avatarVersion: typeof data.avatarUpdatedAt === "string" ? data.avatarUpdatedAt : null,
        });
      } catch {
        // The menu simply shows no team. A failed chrome fetch must never surface as an error on
        // a page whose content loaded fine.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [joined]);

  /*
    The set the organizer assigned, for the menu's highlighted slot.

    Sets are ASSIGNED and never chosen or previewed (PRD §6.2), so naming the set is the only
    feedback a student ever gets about which half of the problem list is theirs. It comes off the
    identity the client already holds rather than a second request.
  */
  const setLabel =
    participant.status === "joined" ? participant.participant.chosenSetLabel : null;

  /**
   * Sign out on the SERVER, then clear the tab, then leave.
   *
   * This used to be `clearParticipant()` plus a navigation, which forgot the participant in
   * sessionStorage and left the session row in Postgres untouched — so the cookie kept working and
   * the next person on a shared library machine got the previous student's contest back by typing
   * `/contest`. Sessions live in Postgres precisely so that they can be revoked (docs/AUTH.md §3);
   * a sign-out that never tells the server is the one case where that buys nothing.
   *
   * `/sign-in`, not `/join`: the join page was deleted with the join route, so the old destination
   * is a 404 — signing out landed a student on a broken page.
   */
  const leave = useCallback(() => {
    void (async () => {
      try {
        await fetch("/api/auth/session", { method: "DELETE" });
      } catch {
        // Best effort, and the navigation happens either way. A student who has decided to leave a
        // shared machine must not be held on the page by a failed request.
      } finally {
        clearParticipant();
        window.location.assign("/sign-in");
      }
    })();
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
        {/*
          `items-stretch`, and the nav is the tallest child.

          That is what puts the active tab's underline on the BAR's bottom edge rather than a few
          pixels under its own label — the detail that separates HackerRank's app nav from a row
          of links that happen to be underlined. Centre the items instead and the rule floats in
          the middle of the bar, which reads as decoration rather than as "you are here".
        */}
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-stretch gap-x-5 px-4">
          <Link href="/contest" className="order-1 flex items-center gap-2.5 py-2.5">
            <Image
              src="/brand/pt-panther.png"
              alt=""
              width={275}
              height={235}
              aria-hidden="true"
              className="h-8 w-auto"
            />
            <span
              className="font-display font-bold whitespace-nowrap"
              style={{ fontSize: "var(--text-sm)" }}
            >
              Coding Night
            </span>
          </Link>

          {/*
            The hairline HackerRank puts between its mark and its tabs. It is what stops the
            wordmark and the first tab reading as one run of text; without it "Coding Night
            Problems" is a single phrase at a glance. Hidden once the nav drops to its own row,
            where it would divide nothing.
          */}
          <span aria-hidden="true" className="order-1 hidden w-px self-center bg-paper/25 md:block md:h-6" />

          {/*
            Third in source order and third in the flex line on a phone, second on a laptop.

            One nav element, moved with `order`, rather than a desktop copy and a mobile copy:
            two navigation landmarks with the same accessible name is a landmark-uniqueness
            failure, and it is the obvious way to get a responsive nav wrong.

            `overflow-x-auto` on the phone row for the same reason TabStrip has it — three tabs at
            360px are close to the edge, and a wrapped tab row stops reading as tabs.
          */}
          <nav
            aria-label="Competitor"
            className="order-3 -mx-4 w-full overflow-x-auto px-4 md:order-2 md:mx-0 md:w-auto md:overflow-x-visible md:px-0"
          >
            <ul className="flex items-stretch gap-1">
              {NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href} className="flex shrink-0">
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={
                        active
                          ? "flex items-center border-b-2 border-panther px-2 py-3 font-semibold text-paper sm:px-3"
                          : "flex items-center border-b-2 border-transparent px-2 py-3 text-paper/75 hover:border-paper/30 hover:text-paper sm:px-3"
                      }
                      style={{ fontSize: "var(--text-sm)" }}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
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
          {/*
            `flex-wrap` on this block, not just `min-w-0` on its children.

            It holds the countdown pill and the account menu. At 360px those are about 200px and
            190px, and a non-wrapping row of them overflows a 360px viewport however small its
            items are willing to become — measured, the page went 436px wide and every competitor
            screen scrolled sideways. Letting the two stack is the fix; shrinking the name only
            moved the number.
          */}
          <div className="order-2 ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 py-2 md:order-3">
            {standings.status === "ready" && standings.data !== null && (
              <Countdown endsAt={standings.data.endsAt} />
            )}

            {participant.status === "joined" && (
              <UserMenu
                displayName={participant.participant.displayName}
                teamName={team?.name ?? null}
                setLabel={setLabel}
                userId={account.userId}
                avatarVersion={account.avatarVersion}
                onSignOut={leave}
              />
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
      {/*
        A tinted ground under the competitor screens, with the content on paper cards above it.

        This is the single device that separates HackerRank's app screens from a document: nothing
        about the typography or the spacing changes, but a page whose panels sit ON something reads
        as built, and one where everything is flush with the background reads as a printout. It
        costs one background colour.

        `/sign-in` and `/join` are excluded because they are full-bleed split screens that supply
        their own grounds.
      */}
      <main id="main" className="flex-1 bg-ink/[0.035]">
        <div className="mx-auto w-full max-w-6xl px-4 py-6">{children}</div>
      </main>
    </>
  );
}
