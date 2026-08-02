import { judgeHealthLevel, type JudgeHealth, type JudgeHealthLevel } from "@/components/admin/contract";

/**
 * Judge health, alarmed on facts rather than inferences.
 *
 * Two renderings, chosen by the health level, and the difference is the point:
 *
 *  - **Something is wrong** — read from across a room while it is going wrong, so every figure
 *    is a large monospace numeral on a dark plate with the state spelled out in words. `--fall`
 *    is legible only once the surface inverts to `--ink` (9.60 there, 1.94 on paper), which is
 *    why the unhealthy state is the one that flips dark rather than the one that tints text.
 *  - **Healthy** — a single dense strip. At the alarm sizing a healthy judge was the loudest
 *    thing on the page, permanently, above a submissions table that is the screen's actual
 *    subject; six quiet figures in a row still answer "is it fine?" at a glance, and the page's
 *    lead goes back to the feed. The plate earns its size by being rare.
 *
 * The loudest state is `offline`: zero live worker heartbeats. It used to be an inference from
 * the queue's shape and sat unnoticed for 12 minutes; the heartbeat makes it a positive fact,
 * so the heading can say what is true and what to do about it without hedging.
 */

/** "3 minutes", never "180000 ms" — the lagging heading is read aloud across a room. */
function formatWaitMinutes(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/**
 * The lagging heading carries the measured age, so the copy cannot be a static record — every
 * other level's words are fixed.
 */
function headingFor(level: JudgeHealthLevel, health: JudgeHealth): string {
  switch (level) {
    case "ok":
      return "Judge healthy";
    case "watch":
      return "Judge needs a look";
    case "lagging":
      return `Submissions are waiting ${formatWaitMinutes(health.oldestWaitingMs ?? 0)}. The judge is running but not keeping up.`;
    // The one condition where nothing at all will happen until a human acts, so the words
    // that matter have to be readable from across the room, not in a body paragraph.
    case "offline":
      return "No judge is running. Nothing will be judged until one starts.";
    case "unreachable":
      return "The judge queue cannot be reached";
  }
}

function formatMs(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** A dark-plate figure: numeral over its label, sized for the back of the room. */
function Stat({ value, label, alarm = false }: { value: string; label: string; alarm?: boolean }) {
  return (
    <div className="min-w-24">
      <div
        className="numeric leading-none font-semibold"
        style={{ fontSize: "var(--text-xl)", color: alarm ? "var(--color-fall)" : undefined }}
      >
        {value}
      </div>
      {/*
        Muted by the text's OWN alpha, never by a wrapper `opacity` — opacity multiplies with
        child alpha, and tests/a11y/team-screens.spec.ts fails a surface outright for it.
      */}
      <div className="mt-tight text-paper/70" style={{ fontSize: "var(--text-xs)" }}>
        {label}
      </div>
    </div>
  );
}

/** A healthy-strip figure: numeral and label on one line, at table density. */
function InlineStat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="numeric font-semibold" style={{ fontSize: "var(--text-sm)" }}>
        {value}
      </span>
      <span className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        {label}
      </span>
    </span>
  );
}

export function JudgeHealthBar({ health }: { health: JudgeHealth }) {
  const level = judgeHealthLevel(health);

  if (level === "ok") {
    // No alarm styling in this branch by construction: any figure that would warrant it —
    // failed jobs, an aging queue, no live worker — moves the level off "ok" before render.
    return (
      <section
        aria-label="Judge health"
        className="flex flex-wrap items-baseline gap-x-8 gap-y-tight rounded-panel border border-rule-edge bg-paper px-4 py-3"
      >
        <p role="status" className="font-bold" style={{ fontSize: "var(--text-sm)" }}>
          {headingFor("ok", health)}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-tight">
          <InlineStat value={String(health.queueDepth)} label="queued" />
          <InlineStat value={String(health.active)} label="judging now" />
          <InlineStat value={String(health.failed)} label="failed jobs" />
          <InlineStat value={String(health.workerCount)} label="workers alive" />
          <InlineStat value={formatMs(health.oldestWaitingMs)} label="oldest wait" />
          <InlineStat value={health.reachable ? "yes" : "NO"} label="queue reachable" />
        </div>
      </section>
    );
  }

  // Watch is a look-when-you-can gold; everything above it is a red-rail alarm.
  const severe = level !== "watch";

  return (
    <section
      aria-label="Judge health"
      className="rounded-panel bg-ink p-5 text-paper"
      style={{
        borderLeft: `var(--rail-width) solid ${severe ? "var(--color-fall)" : "var(--color-gold)"}`,
      }}
    >
      <p
        role="status"
        className="mb-group font-bold"
        style={{
          fontSize: "var(--text-md)",
          color: severe ? "var(--color-fall)" : "var(--color-gold)",
        }}
      >
        {headingFor(level, health)}
      </p>

      <div className="flex flex-wrap gap-x-10 gap-y-group">
        <Stat
          value={String(health.queueDepth)}
          label="queued"
          alarm={level === "offline" || health.queueDepth > 25}
        />
        <Stat value={String(health.active)} label="judging now" alarm={level === "offline"} />
        <Stat value={String(health.failed)} label="failed jobs" alarm={health.failed > 0} />
        {/*
          Live heartbeat keys, not Redis's client list. Zero here is the worker itself having
          stopped saying "I am alive" for 30 seconds — the figure the offline heading stands on,
          so it goes red together with it.
        */}
        <Stat
          value={String(health.workerCount)}
          label="workers alive"
          alarm={health.workerCount === 0}
        />
        <Stat
          value={formatMs(health.oldestWaitingMs)}
          label="oldest wait"
          alarm={level === "lagging"}
        />
        <Stat
          value={health.reachable ? "yes" : "NO"}
          label="queue reachable"
          alarm={!health.reachable}
        />
      </div>

      {level === "offline" && (
        <p className="mt-group max-w-[70ch]" style={{ fontSize: "var(--text-sm)" }}>
          No worker heartbeat is live. Submissions are still accepted and queued, so no student
          work is lost, but nothing will be judged until a worker starts. On the dev machine
          start one by hand: npm run worker. On a deployed host it is the worker service:
          docker compose up -d worker.
        </p>
      )}

      {level === "lagging" && (
        <p className="mt-group max-w-[70ch]" style={{ fontSize: "var(--text-sm)" }}>
          A judge is alive and taking work, but the oldest submission has been waiting longer
          than anything healthy should. Age is the signal here, not depth: a deep queue that
          drains in seconds is fine, and even a short one going stale is not. Check whether the
          judge host is overloaded, and whether one submission is compiling at the limit ahead
          of everything else.
        </p>
      )}

      {level === "unreachable" && (
        <p className="mt-group max-w-[70ch]" style={{ fontSize: "var(--text-sm)" }}>
          Submissions are being refused, not queued: a student pressing Submit gets an error.
          Check Redis first. The zeros above mean there was nothing to ask, not an empty queue.
          That includes the worker count, so whether a judge is running is unknowable from here
          until the queue answers.
        </p>
      )}
    </section>
  );
}
