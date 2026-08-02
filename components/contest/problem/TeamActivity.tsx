"use client";

import { useEffect, useState } from "react";

import type { TeamProblemFeed } from "@/lib/schemas/api";
import { formatEventTime } from "@/lib/contest/event-time";

import { contestApi } from "../data/backend";
import { VERDICT_DISPLAY } from "../verdict/verdict-display";

/**
 * The team's shared attempt log for a GROUP problem, in the metadata rail.
 *
 * ICPC teams coordinate by sitting behind one keyboard; this team sits behind three or four,
 * and without this panel "is anyone on the group problem" and "did the 80 already land" are
 * questions shouted across a room. Who submitted, when, and what the judge said - never the
 * code, which is the feed's whole security posture (see `getTeamProblemFeed`).
 *
 * ## Presentation rules this panel inherits
 *
 * - Verdicts are WORDS from `VERDICT_DISPLAY`, at full-strength ink. The verdict TONE colours
 *   are dark-surface only (they fail AA on paper), so on this paper rail the word does all the
 *   work and the best-so-far row gets weight, never colour alone.
 * - Times are Eastern like every clock a person reads here.
 * - A null verdict is a submission the judge is still running; it says so rather than showing
 *   an empty cell that reads as a load failure.
 *
 * ## Polling
 *
 * Ten seconds, unconditionally simple: teammates' verdicts land at judge speed, not keystroke
 * speed, and the panel's job is "within moments", not "same frame". The poll stops with the
 * component. Errors keep the last good feed on screen and note the staleness quietly - a
 * coordination panel that replaces itself with a red banner mid-round is worse than one that
 * is ten seconds behind.
 */

const POLL_MS = 10_000;

export function TeamActivity({ slug }: { readonly slug: string }) {
  const [feed, setFeed] = useState<TeamProblemFeed | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async (): Promise<void> => {
      try {
        const next = await contestApi.getTeamProblemFeed(slug);
        if (cancelled) return;
        setFeed(next);
        setStale(false);
      } catch {
        if (cancelled) return;
        setStale(true);
      }
      if (!cancelled) timer = setTimeout(() => void tick(), POLL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [slug]);

  // Nothing until the first answer arrives: the rail already has content, and a skeleton for a
  // panel this small is churn. After that the panel never disappears, only updates.
  if (feed === null) return null;

  return (
    <section
      aria-label="Team activity on this problem"
      className="motion-swap-in mt-6 border-t border-rule-edge pt-4"
    >
      <h2 className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
        Team activity
      </h2>
      <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        {feed.teamName === null ? (
          <>
            This is a group problem. Once an organizer puts you on a team, your whole
            team&rsquo;s attempts show here and the best one counts.
          </>
        ) : (
          <>
            Everyone on {feed.teamName} can submit here. The team&rsquo;s score is the best
            single attempt: <span className="numeric font-semibold">{feed.bestScore}</span>{" "}
            so far, and a weaker attempt never lowers it.
          </>
        )}
      </p>

      {feed.teamName !== null && feed.entries.length === 0 && (
        <p className="mt-2 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
          Nobody on your team has attempted this one yet.
        </p>
      )}

      {feed.entries.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {feed.entries.map((entry) => {
            const setsBest = entry.score === feed.bestScore && feed.bestScore > 0;
            return (
              <li
                key={entry.submissionId}
                className="flex items-baseline justify-between gap-3 border-b border-rule-hair py-1.5 last:border-b-0"
                style={{ fontSize: "var(--text-xs)" }}
              >
                <span className="min-w-0 truncate">
                  <span className={setsBest ? "font-semibold" : undefined}>
                    {entry.mine ? "You" : entry.displayName}
                  </span>{" "}
                  <span className="text-ink/60">
                    {entry.verdict === null
                      ? "is being judged"
                      : VERDICT_DISPLAY[entry.verdict].label.toLowerCase()}
                  </span>
                </span>
                <span className="numeric whitespace-nowrap text-ink/60">
                  {entry.verdict !== null && (
                    <span className={setsBest ? "font-semibold text-ink" : undefined}>
                      {entry.score}
                    </span>
                  )}{" "}
                  {formatEventTime(entry.submittedAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {stale && (
        <p role="status" className="mt-2 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          Could not refresh just now. Showing the last answer; it retries on its own.
        </p>
      )}
    </section>
  );
}
