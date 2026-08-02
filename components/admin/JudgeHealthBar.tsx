import { judgeHealthLevel, type JudgeHealth, type JudgeHealthLevel } from "@/components/admin/contract";

/**
 * Judge health and queue depth.
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
 */

const LEVEL_COPY: Record<JudgeHealthLevel, string> = {
  ok: "Judge healthy",
  watch: "Judge needs a look",
  // The one state with a full sentence for a heading, on purpose. This exact condition sat
  // unnoticed on the dev machine and turned a 5 s verdict into a 12 minute one, so the words
  // that matter have to be readable from across the room, not in a body paragraph.
  stalled: "Submissions are queueing and no judge is taking them. Is the worker running?",
  down: "Judge is not running",
};

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
    // failed jobs, a starved queue, no workers — moves the level off "ok" before render.
    return (
      <section
        aria-label="Judge health"
        className="flex flex-wrap items-baseline gap-x-8 gap-y-tight rounded-panel border border-rule-edge bg-paper px-4 py-3"
      >
        <p role="status" className="font-bold" style={{ fontSize: "var(--text-sm)" }}>
          {LEVEL_COPY.ok}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-tight">
          <InlineStat value={String(health.queueDepth)} label="queued" />
          <InlineStat value={String(health.active)} label="judging now" />
          <InlineStat value={String(health.failed)} label="failed jobs" />
          <InlineStat value={String(health.workersOnline)} label="workers online" />
          <InlineStat value={formatMs(health.oldestWaitingMs)} label="oldest wait" />
          <InlineStat value={health.reachable ? "yes" : "NO"} label="queue reachable" />
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Judge health"
      className="rounded-panel bg-ink p-5 text-paper"
      style={{
        borderLeft: `var(--rail-width) solid ${
          level === "down" || level === "stalled" ? "var(--color-fall)" : "var(--color-gold)"
        }`,
      }}
    >
      <p
        role="status"
        className="mb-group font-bold"
        style={{
          fontSize: "var(--text-md)",
          color:
            level === "down" || level === "stalled" ? "var(--color-fall)" : "var(--color-gold)",
        }}
      >
        {LEVEL_COPY[level]}
      </p>

      <div className="flex flex-wrap gap-x-10 gap-y-group">
        {/*
          When stalled, the two figures that ARE the condition go red together: a nonzero
          queue beside a zero "judging now" is the whole finding, and the pairing is what
          points at the worker rather than at load.
        */}
        <Stat
          value={String(health.queueDepth)}
          label="queued"
          alarm={level === "stalled" || health.queueDepth > 25}
        />
        <Stat value={String(health.active)} label="judging now" alarm={level === "stalled"} />
        <Stat value={String(health.failed)} label="failed jobs" alarm={health.failed > 0} />
        <Stat
          value={String(health.workersOnline)}
          label="workers online"
          alarm={health.workersOnline === 0}
        />
        <Stat value={formatMs(health.oldestWaitingMs)} label="oldest wait" />
        {/*
          Was "last heartbeat", against a field nothing ever wrote — it rendered a dash on every
          load and looked like a judge that had never checked in. What is actually knowable is
          whether the queue answered at all, and that is the distinction an organizer needs:
          "no workers" means start one, "no queue" means Redis is gone.
        */}
        <Stat
          value={health.reachable ? "yes" : "NO"}
          label="queue reachable"
          alarm={!health.reachable}
        />
      </div>

      {level === "stalled" && (
        <p className="mt-group max-w-[70ch]" style={{ fontSize: "var(--text-sm)" }}>
          The queue is reachable and still accepting, so no student work is lost, but nothing
          has taken a job for over 30 seconds. Check the worker process first: on the dev
          machine it is started by hand (npm run worker), not as a service. This exact
          condition once sat unnoticed here until a verdict took 12 minutes.
        </p>
      )}

      {level === "down" && (
        <p className="mt-group max-w-[70ch]" style={{ fontSize: "var(--text-sm)" }}>
          {health.reachable
            ? "Nothing is being judged. Submissions are still being accepted and queued, so no student work is lost, but no verdict will land until a worker comes back."
            : "The judge queue cannot be reached, so submissions are being refused, not queued. A student pressing Submit gets an error. Check Redis first. The zeros above mean there was nothing to ask, not an empty queue."}
        </p>
      )}
    </section>
  );
}
