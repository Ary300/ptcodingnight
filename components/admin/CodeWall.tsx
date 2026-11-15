"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CODE_WALL_PAGE_SIZE, initialRange, paginateSeats } from "@/lib/contest/code-wall";
import { API_ROUTES, CodeWallSchema, type CodeWallSeat } from "@/lib/schemas/api";

import { useResource } from "../contest/data/useResource";
import styles from "./code-wall.module.css";

/**
 * The code wall an organizer projects while the room arrives.
 *
 * One card per student: their name, their team, and the six characters they type. It rotates through
 * the roster A to Z and states the letter range of the page it is showing, which is what makes a
 * rotating board usable — a student who sees "A to E" knows whether to look now or wait. The design
 * conventions and the exposure this accepts are argued in `lib/contest/code-wall.ts`.
 *
 * ## The controls belong to the laptop, not the room
 *
 * They stay on screen rather than fading out on idle, because a control that appears on mouse move
 * is a control an organizer cannot find with forty people watching. Every one has a keyboard
 * shortcut, listed on the screen itself:
 *
 * - `space` pauses the rotation, for the student who says "wait, go back"
 * - the arrow keys page by hand
 * - `b` blacks the screen out, for the moment a projected roster should stop being readable
 *
 * ## What refreshes and what does not
 *
 * The roster is re-read every 20 seconds, so the wall thins out as students sign in. The rotation
 * is deliberately NOT reset by that refresh: a page that jumps back to the start because somebody
 * arrived is a page nobody can finish reading.
 */

const ROTATE_MS = 12_000;
const REFRESH_MS = 20_000;

export function CodeWall({ contestId }: { readonly contestId: string }) {
  const load = useCallback(async () => {
    const response = await fetch(API_ROUTES.adminCodeWall(contestId), { cache: "no-store" });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error("Those codes could not be loaded.");
    const data =
      typeof payload === "object" && payload !== null && "data" in payload
        ? (payload as { data: unknown }).data
        : null;
    return CodeWallSchema.parse(data);
  }, [contestId]);

  const wall = useResource(load, contestId);
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [blackout, setBlackout] = useState(false);
  const [showArrived, setShowArrived] = useState(false);

  /*
    The refresh, independent of the rotation.

    `reload` is pulled out into its own binding rather than used as `wall.reload`: the resource
    object is new on every render, so depending on it would tear down and rebuild this interval
    twice a second and the wall would never actually refresh. The function itself is stable.
  */
  const { reload } = wall;
  useEffect(() => {
    const timer = setInterval(reload, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [reload]);

  const seats: readonly CodeWallSeat[] = useMemo(() => {
    if (wall.status !== "ready") return [];
    return showArrived ? wall.data.seats : wall.data.seats.filter((seat) => !seat.arrived);
  }, [wall, showArrived]);

  const pages = useMemo(() => paginateSeats(seats, CODE_WALL_PAGE_SIZE), [seats]);
  /*
    Clamped on READ rather than corrected in an effect. Seats leave the list as students sign in, so
    the last page can vanish under the rotation; an effect that fixed `page` afterwards would render
    one empty frame first, on a projector, in front of the room.
  */
  const pageCount = Math.max(pages.length, 1);
  const current = Math.min(page, pageCount - 1);
  const shown = pages[current] ?? [];

  useEffect(() => {
    if (paused || pageCount < 2) return;
    const timer = setInterval(() => {
      setPage((previous) => (previous + 1) % pageCount);
    }, ROTATE_MS);
    return () => {
      clearInterval(timer);
    };
  }, [paused, pageCount]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === " ") {
        event.preventDefault();
        setPaused((previous) => !previous);
        return;
      }
      if (event.key === "ArrowRight") {
        setPaused(true);
        setPage((previous) => (previous + 1) % pageCount);
        return;
      }
      if (event.key === "ArrowLeft") {
        setPaused(true);
        setPage((previous) => (previous - 1 + pageCount) % pageCount);
        return;
      }
      if (event.key === "b" || event.key === "B") setBlackout((previous) => !previous);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [pageCount]);

  if (blackout) {
    return (
      <div className={styles.blackout} role="region" aria-label="Screen hidden">
        <p className={styles.blackoutTitle}>Screen hidden</p>
        {/* The way back, on the screen, because a blank projector with no instructions is a panic. */}
        <p className={styles.blackoutHint}>Press B to show the codes again</p>
        <button type="button" className={styles.button} onClick={() => setBlackout(false)}>
          Show the codes
        </button>
      </div>
    );
  }

  const range = initialRange(shown.map((seat) => seat.displayName));
  const total = wall.status === "ready" ? wall.data.seats.length : 0;
  const arrived = wall.status === "ready" ? wall.data.seats.filter((s) => s.arrived).length : 0;

  return (
    <div className={styles.wall}>
      <header className={styles.head}>
        <div>
          <p className={styles.title}>
            {wall.status === "ready" ? wall.data.contestName : "Join codes"}
          </p>
          {/*
            The address, in the accent, at heading size. A wall of codes with no address is a
            puzzle, and this is the line a student reads before they start looking for their name.
          */}
          <p className={styles.instruction}>ptcodingnight.com/join</p>
        </div>
        <p className={styles.meta}>
          {range === "" ? "" : `${range}, `}
          {arrived} of {total} signed in
        </p>
      </header>

      {wall.status === "loading" && <p className={styles.empty}>Loading the codes…</p>}
      {wall.status === "error" && (
        <p role="alert" className={styles.empty}>
          {wall.error}
        </p>
      )}

      {wall.status === "ready" && shown.length === 0 && (
        <p className={styles.empty}>
          {total === 0
            ? "No seat in this contest has a code yet. Add students on the Teams tab."
            : "Everybody on the roster has signed in."}
        </p>
      )}

      {shown.length > 0 && (
        // Keyed by page so the entrance replays on every rotation rather than only on mount.
        <ul className={styles.grid} key={current}>
          {shown.map((seat) => (
            <li
              key={seat.participantId}
              className={`${styles.seat} ${seat.arrived ? styles.arrivedSeat : ""}`}
            >
              <p className={styles.name}>{seat.displayName}</p>
              {seat.arrived ? (
                /* No code for a seat that is already in: they do not need it, and the room does
                   not need to be able to type it. */
                <p className={styles.arrivedMark}>Signed in</p>
              ) : (
                <p className={styles.code}>{seat.joinCode}</p>
              )}
              <p className={styles.team}>
                {seat.teamName ?? "No team yet"}
                {seat.divisionName === null ? "" : `, ${seat.divisionName}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      <footer className={styles.foot}>
        <span className={styles.pageDots}>
          Page {current + 1} of {pageCount}
          {paused ? ", paused" : ""}
        </span>
        <span className={styles.controls}>
          <button
            type="button"
            className={styles.button}
            onClick={() => setPaused((previous) => !previous)}
          >
            {paused ? "Resume (space)" : "Pause (space)"}
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => setShowArrived((previous) => !previous)}
          >
            {showArrived ? "Hide who is in" : "Show whole roster"}
          </button>
          <button type="button" className={styles.button} onClick={() => setBlackout(true)}>
            Hide screen (B)
          </button>
          {/*
            The way out. The wall covers the admin chrome, tab strip included, so without this the
            only exit is the browser's back button — which is exactly the complaint that was filed
            against the projector page.
          */}
          <Link className={styles.button} href={`/admin/contests/${contestId}/slips`}>
            Close the wall
          </Link>
        </span>
      </footer>
    </div>
  );
}
