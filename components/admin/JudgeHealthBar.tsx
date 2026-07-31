import { judgeHealthLevel, type JudgeHealth, type JudgeHealthLevel } from "@/components/admin/contract";

/**
 * Judge health and queue depth.
 *
 * Read from across a room while something is going wrong, so every figure is a large
 * monospace numeral with a small label under it, and the overall state is spelled out in
 * words as well as marked. `--fall` is legible only once the surface inverts to `--ink`
 * (9.60 there, 1.94 on paper), which is why the unhealthy state is the one that flips to a
 * dark plate rather than the one that tints some text.
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

function Stat({ value, label, alarm = false }: { value: string; label: string; alarm?: boolean }) {
  return (
    <div className="min-w-24">
      <div
        className="numeric leading-none font-semibold"
        style={{ fontSize: "var(--text-xl)", color: alarm ? "var(--color-fall)" : undefined }}
      >
        {value}
      </div>
      <div className="mt-1 opacity-70" style={{ fontSize: "var(--text-xs)" }}>
        {label}
      </div>
    </div>
  );
}

export function JudgeHealthBar({ health }: { health: JudgeHealth }) {
  const level = judgeHealthLevel(health);
  const dark = level !== "ok";

  return (
    <section
      aria-label="Judge health"
      className={`rounded p-5 ${dark ? "bg-ink text-paper" : "border border-ink/12 bg-paper"}`}
      style={
        dark
          ? {
              borderLeft: `var(--rail-width) solid ${
                level === "down" ? "var(--color-fall)" : "var(--color-gold)"
              }`,
            }
          : undefined
      }
    >
      <p
        role="status"
        className="mb-4 font-bold"
        style={{
          fontSize: "var(--text-md)",
          color: dark ? (level === "down" ? "var(--color-fall)" : "var(--color-gold)") : undefined,
        }}
      >
        {LEVEL_COPY[level]}
      </p>

      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <Stat value={String(health.queueDepth)} label="queued" alarm={dark && health.queueDepth > 25} />
        <Stat value={String(health.active)} label="judging now" />
        <Stat value={String(health.failed)} label="failed jobs" alarm={dark && health.failed > 0} />
        <Stat
          value={String(health.workersOnline)}
          label="workers online"
          alarm={dark && health.workersOnline === 0}
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
        <p className="mt-4 max-w-[70ch]" style={{ fontSize: "var(--text-sm)" }}>
          {health.reachable
            ? "Nothing is being judged. Submissions are still being accepted and queued, so no student work is lost, but no verdict will land until a worker comes back."
            : "The judge queue cannot be reached, so submissions are being REFUSED rather than queued — a student pressing Submit gets an error. Check Redis before anything else; the numbers above are zeros because there was nothing to ask, not because the queue is empty."}
        </p>
      )}
    </section>
  );
}
