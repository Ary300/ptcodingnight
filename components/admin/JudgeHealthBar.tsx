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
          level === "down" ? "var(--color-fall)" : "var(--color-gold)"
        }`,
      }}
    >
      <p
        role="status"
        className="mb-group font-bold"
        style={{
          fontSize: "var(--text-md)",
          color: level === "down" ? "var(--color-fall)" : "var(--color-gold)",
        }}
      >
        {LEVEL_COPY[level]}
      </p>

      <div className="flex flex-wrap gap-x-10 gap-y-group">
        <Stat value={String(health.queueDepth)} label="queued" alarm={health.queueDepth > 25} />
        <Stat value={String(health.active)} label="judging now" />
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

      {level === "down" && (
        <p className="mt-group max-w-[70ch]" style={{ fontSize: "var(--text-sm)" }}>
          {health.reachable
            ? "Nothing is being judged. Submissions are still being accepted and queued, so no student work is lost, but no verdict will land until a worker comes back."
            : "The judge queue cannot be reached, so submissions are being REFUSED rather than queued: a student pressing Submit gets an error. Check Redis before anything else; the numbers above are zeros because there was nothing to ask, not because the queue is empty."}
        </p>
      )}
    </section>
  );
}
