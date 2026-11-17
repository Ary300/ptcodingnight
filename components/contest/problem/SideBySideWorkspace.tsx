"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { SplitPanes } from "./SplitPanes";

/**
 * The problem page laid out as HackerRank's test editor.
 *
 * Under the site's top bar the workspace takes the whole window (`full-bleed.ts`) and never
 * scrolls as a page. The left pane is the problem: a compact header that stays put, then the
 * statement, examples, samples and details scrolling inside the pane. The right pane is the work:
 * the editor with its language tabs, then the Results drawer, then the Run and Submit bar pinned
 * to the bottom edge. The divider between them is `SplitPanes`.
 *
 * ## The header is small on purpose
 *
 * The stacked page opens on a 40px title, which is right for a page a student reads top to
 * bottom and wrong for a workspace they sit in for forty minutes: every pixel of title is a line
 * of statement that does not fit. Here the problem is named once, "P1 (Two Tables, One Total)",
 * at statement-heading size, as the last step of the breadcrumb that leads back to the list.
 * The heading is still the page's `h1`, so a screen reader lands on the same name either way.
 *
 * This component arranges; it owns no state. Every block arrives from `ProblemWorkspace`, which
 * renders the same statement, editor and verdict in both layouts.
 */

export interface SideBySideWorkspaceProps {
  /** "P1 (Two Tables, One Total)". */
  readonly label: string;
  /** The Solved / Attempted / Locked pill, or nothing. */
  readonly status: ReactNode;
  /** The Problem / My submissions tabs, carrying the layout toggle. */
  readonly tabs: ReactNode;
  /** Statement, samples and the details rail. */
  readonly statement: ReactNode;
  /** The code editor, which fills the room the drawer and the action bar leave. */
  readonly editor: ReactNode;
  readonly results: ReactNode;
  readonly actions: ReactNode;
}

export function SideBySideWorkspace({
  label,
  status,
  tabs,
  statement,
  editor,
  results,
  actions,
}: SideBySideWorkspaceProps) {
  return (
    <SplitPanes
      startLabel="Problem statement"
      endLabel="Your solution"
      start={
        <>
          <header className="shrink-0 px-5 pt-3">
            <nav aria-label="Breadcrumb">
              <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <li className="flex items-center gap-2" style={{ fontSize: "var(--text-xs)" }}>
                  <Link
                    href="/contest"
                    className="text-ink/70 underline-offset-2 hover:text-ink hover:underline"
                  >
                    Problems
                  </Link>
                  <span aria-hidden="true" className="text-ink/60">
                    ›
                  </span>
                </li>
                <li aria-current="page" className="flex min-w-0 items-center gap-3">
                  <h1
                    className="min-w-0 font-display leading-tight font-bold"
                    style={{ fontSize: "var(--text-md)" }}
                  >
                    {label}
                  </h1>
                  {status}
                </li>
              </ol>
            </nav>
            {/*
              Edge to edge across the pane, so the folder tabs read as the pane's own chrome
              rather than as a card set inside it. The strip's side borders land on the window
              edge and on the divider's gutter.
            */}
            <div className="-mx-5">{tabs}</div>
          </header>
          {/*
            The only scroller in this pane. `overscroll-contain` keeps a fling at the end of the
            statement from scrolling anything behind it, and the bottom padding lets the last
            sample clear the window edge.
          */}
          <div
            data-split-scroll="statement"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-10"
          >
            {statement}
          </div>
        </>
      }
      end={
        <>
          {/*
            The editor takes every row the drawer and the bar leave, and never fewer than 14rem:
            an open drawer is capped (ResultsDrawer) precisely so this floor always holds.
          */}
          <div className="flex min-h-[14rem] flex-1 flex-col">{editor}</div>
          {results}
          {actions}
        </>
      }
    />
  );
}
