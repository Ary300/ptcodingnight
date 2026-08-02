"use client";

import { useEffect, useRef } from "react";

import { Delta, Rail, railStateForDelta } from "@/components/ui";
import type { StandingsResponse } from "@/lib/schemas/api";

/**
 * A compact standings panel for the competitor lobby. The projector owns the monumental
 * version; this is the "where am I" glance.
 *
 * **It is dark because it has to be.** `--rise`, `--fall` and `--gold` all fail AA on
 * `--paper` (docs/DESIGN.md §2), and the rail's resting state is `--paper` at 22% — a rank
 * board on a light background would either be illegible or would have to drop the colour
 * channel entirely. Bringing the `--ink` surface with it keeps the same visual language the
 * room is watching on the projector.
 *
 * Rank movement is glyph (`<Delta>`) plus rail plus position. Remove the colour and it still
 * reads — that is the test in DESIGN.md §3.
 */

export interface StandingsCardProps {
  standings: StandingsResponse;
  /** Highlights "you". Null before joining. */
  participantId: string | null;
}

type Division = StandingsResponse["divisions"][number];

/**
 * One division's table.
 *
 * It is its own component so that it can hold the two refs the scroll below needs — a ref per
 * division is not expressible from inside a `map`.
 */
function DivisionBoard({
  division,
  frozen,
  participantId,
  showName,
}: {
  division: Division;
  frozen: boolean;
  participantId: string | null;
  showName: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const yourRowRef = useRef<HTMLTableRowElement | null>(null);

  /*
    Bring the viewer's own row into the capped box on arrival.

    The cap below is right and stays — but the comment defending it claimed "the viewer's own row
    stays findable because it is tinted", and a tint 900px below the fold is not findable by
    anything. With a real roster the single row this card exists to show was simply not in the
    448px on screen, so a student had to scroll a list of other people's names to find themselves.
    That is precisely the cost the cap was introduced to avoid, moved one level down.

    `scrollTop` is written directly rather than calling `scrollIntoView`. `scrollIntoView` walks up
    and scrolls every scrollable ancestor including the document, so a lobby the student had not
    scrolled would jump on load. Writing `scrollTop` cannot move anything but this box.
  */
  useEffect(() => {
    const scroller = scrollerRef.current;
    const row = yourRowRef.current;
    if (scroller === null || row === null) return;

    // Not `offsetTop`: that is measured against the nearest POSITIONED ancestor, which is not
    // necessarily the scroller. The difference of the two bounding rects is, and it is already in
    // the scroller's scrolled coordinate space.
    const offset = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const alreadyVisible = offset >= 0 && offset + row.offsetHeight <= scroller.clientHeight;
    if (alreadyVisible) return;

    // A third of the box above the row, so it lands with context on both sides rather than
    // pinned under the sticky header.
    scroller.scrollTop += offset - scroller.clientHeight / 3;
  }, [division.divisionId, participantId]);

  return (
    <div className="mt-4">
      {showName && (
        <h3 className="text-paper/60 uppercase" style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}>
          {division.name}
        </h3>
      )}

      {/*
        The table scrolls INSIDE the card rather than being clipped by it.

        Six columns do not fit a 360px phone, and without this the card simply cut "Penalty"
        off at its right edge — a number a student is being scored on, silently missing, with
        no scrollbar to say it was there. The page itself still does not scroll sideways,
        which is the rule that matters (DESIGN.md §7).
      */}
      {/*
        `tabIndex` because a scrollable box with nothing focusable in it is unreachable by
        keyboard — axe calls that `scrollable-region-focusable`, and a serious finding there
        is a G9 failure as well as a real one.
      */}
      {/*
        `role="group"` rather than a bare div, because `aria-label` on an element with no role
        is prohibited (axe: `aria-prohibited-attr`, serious) — and rather than `region`,
        because one landmark per division would bury the real ones.
      */}
      <div
        ref={scrollerRef}
        tabIndex={0}
        role="group"
        aria-label={`${division.name} standings table`}
        /*
          Height-capped as well as width-scrolled.

          This is the "where am I" glance, not the board — the projector owns the board. With
          a real roster the card ran past 3,000px and pushed the whole lobby into a scroll
          whose only content was other people's names, which is exactly the opposite of a
          glance. The effect above is what keeps the viewer's own row inside the cap.
        */
        className="mt-2 max-h-[28rem] overflow-auto"
      >
        <table className="w-full border-collapse">
          <caption className="sr-only">
            {division.name} standings{frozen ? ", frozen" : ""}
          </caption>
          <thead>
            {/*
              `sticky` on each `th`, not on the `tr` — a table row is not a positionable box in
              any browser that matters, so sticking the row silently does nothing. It has to
              carry `bg-ink` too, or the rows scroll THROUGH the header rather than under it.
            */}
            <tr className="text-paper/50" style={{ fontSize: "var(--text-xs)" }}>
              <th scope="col" className="sticky top-0 z-10 w-2 bg-ink">
                <span className="sr-only">Trend</span>
              </th>
              {/*
                `pl-2` on every column after the first, because these headers ran together:
                "RankName" and "Move ScorePenalty" rendered as single words. A table cell has no
                gap of its own, and three right-aligned numeric columns put their labels flush
                against each other — legible in the mock-up, unreadable with real data.
              */}
              <th scope="col" className="sticky top-0 z-10 bg-ink py-1 pl-2 text-left font-normal">
                Rank
              </th>
              <th scope="col" className="sticky top-0 z-10 bg-ink py-1 pl-2 text-left font-normal">
                Name
              </th>
              <th scope="col" className="sticky top-0 z-10 bg-ink py-1 pl-3 text-right font-normal">
                Move
              </th>
              <th scope="col" className="sticky top-0 z-10 bg-ink py-1 pl-3 text-right font-normal">
                Score
              </th>
              <th scope="col" className="sticky top-0 z-10 bg-ink py-1 pl-3 text-right font-normal">
                Penalty
              </th>
            </tr>
          </thead>
          <tbody>
            {division.rows.map((row) => {
              const isYou = participantId !== null && row.participantId === participantId;
              return (
                <tr
                  key={row.participantId}
                  ref={isYou ? yourRowRef : undefined}
                  className="border-t border-paper/10"
                  style={{ background: isYou ? "color-mix(in srgb, var(--color-paper) 8%, transparent)" : undefined }}
                >
                  <td className="py-1.5">
                    <span className="flex h-full items-stretch">
                      <Rail state={railStateForDelta(row.delta)} />
                    </span>
                  </td>
                  <td className="numeric py-1.5 pl-2" style={{ fontSize: "var(--text-sm)" }}>
                    {row.rank}
                    {row.isTied && <span className="text-paper/55">=</span>}
                  </td>
                  <td
                    className="py-1.5 pl-2 font-display"
                    style={{ fontSize: "var(--text-sm)" }}
                  >
                    {row.displayName}
                    {isYou && (
                      <span className="ml-2 font-body text-paper/55" style={{ fontSize: "var(--text-xs)" }}>
                        {/*
                          `ml-2` is a visual gap and nothing else — the accessible name is the
                          concatenation of the text nodes, so this row announced as
                          "Audit Teamedyou". A screen reader gets the punctuation a sighted
                          reader gets from the space.
                        */}
                        <span className="sr-only">, </span>
                        you
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right" style={{ fontSize: "var(--text-sm)" }}>
                    <Delta value={row.delta} />
                  </td>
                  <td className="numeric py-1.5 pl-2 text-right" style={{ fontSize: "var(--text-sm)" }}>
                    {row.score}
                  </td>
                  <td className="numeric py-1.5 pl-2 text-right text-paper/55" style={{ fontSize: "var(--text-sm)" }}>
                    {row.penaltyMinutes}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StandingsCard({ standings, participantId }: StandingsCardProps) {
  const divisions = standings.divisions;

  if (divisions.length === 0) {
    return null;
  }

  /*
    A division heading only when there is more than one division to tell apart.

    A contest with no `Division` rows puts everybody in one synthetic bucket, and
    `lib/contest/standings.ts` names that bucket "Unassigned". So the first thing a student read
    about their own leaderboard was the word UNASSIGNED, in small-caps letterspaced label styling
    directly under the "Standings" heading — which looks exactly like a field that failed to load.
    With a single bucket the name distinguishes nothing from nothing; it is only information when
    there is a second division on screen to tell it from.

    The `<caption>` keeps the name in every case: a screen reader moving between tables needs them
    told apart even where a sighted reader can see there is only one.
  */
  const showDivisionNames = divisions.length > 1;

  return (
    <section aria-label="Standings" className="rounded bg-ink p-4 text-paper">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
          Standings
        </h2>
        {standings.frozen && (
          <span
            className="px-2 py-0.5 font-bold uppercase"
            style={{
              background: "var(--color-gold)",
              color: "var(--color-ink)",
              fontSize: "var(--text-xs)",
              letterSpacing: "0.08em",
            }}
          >
            Board frozen
          </span>
        )}
      </header>

      {standings.frozen && (
        <p className="mt-2 text-paper/60" style={{ fontSize: "var(--text-xs)" }}>
          Positions are still moving underneath. You will see them at the reveal.
        </p>
      )}

      {divisions.map((division) => (
        <DivisionBoard
          key={division.divisionId}
          division={division}
          frozen={standings.frozen}
          participantId={participantId}
          showName={showDivisionNames}
        />
      ))}
    </section>
  );
}
