"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui";
import { useResource } from "@/components/contest/data/useResource";
import { AdminProblemBankSchema, type AdminProblemRow } from "@/lib/schemas/api";

import { AlertPlate, Panel } from "@/components/admin/Panel";
import { ProblemStatePill } from "@/components/admin/StatusPill";

/**
 * Choose a contest's problems, give each one a slot, and save the line-up.
 *
 * ## What this replaces
 *
 * `ProblemBank` rendered twelve hardcoded fixtures from `stub-data.ts` — while the database held
 * 130 real problems — and its "Add to contest" button fired no network request at all. Clicking it
 * put the problem in a local array; reloading the page emptied it. There was no route to save to
 * either, because nothing in the codebase wrote `ContestProblem`.
 *
 * So this reads `GET /api/admin/problems` and writes `PUT /api/admin/contests/{id}/problems`.
 *
 * ## Slot, points and set are chosen HERE, not later
 *
 * The old flow deferred them to "the contest screen once the line-up is settled", and that screen
 * did not exist. They belong with the choice anyway: a problem's base points and which set it sits
 * in are what make it a slot in a contest rather than a row in a bank, and an organizer picking
 * problems is already thinking about the shape of the round.
 *
 * A blank set label means a GROUP problem — every team works it regardless of assignment. That is
 * the distinction the whole Coding Night format rests on, so it is spelled out on screen rather
 * than implied by a naming convention.
 *
 * ## Why a problem can be picked even when it is not ready
 *
 * `readyBlockers` comes from the server and is shown, but it does not disable the row. An
 * organizer assembling next week's line-up legitimately wants to slot a problem whose statement is
 * still being written. What must not happen is a DRAFT problem going into a LIVE contest, and that
 * is refused by the API — the screen's job is to make sure nobody is surprised by the refusal.
 */

export interface ContestLineupProps {
  readonly contestId: string;
}

interface Slot {
  readonly problemId: string;
  readonly title: string;
  slotLabel: string;
  basePoints: number;
  setLabel: string;
}

async function loadBank(): Promise<readonly AdminProblemRow[]> {
  const response = await fetch("/api/admin/problems", { cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: { message?: unknown } }).error.message ?? "")
        : "";
    throw new Error(message === "" ? "The problem bank could not be loaded." : message);
  }
  const data =
    typeof body === "object" && body !== null && "data" in body
      ? (body as { data: unknown }).data
      : body;
  return AdminProblemBankSchema.parse(data).problems;
}

export function ContestLineup({ contestId }: ContestLineupProps) {
  const bank = useResource(useCallback(() => loadBank(), []));

  const [slots, setSlots] = useState<readonly Slot[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = (problem: AdminProblemRow): void => {
    setSaved(false);
    setSlots((current) => [
      ...current,
      {
        problemId: problem.problemId,
        title: problem.title,
        // A sensible default the organizer can overwrite: A1, A2, A3… Numbering by position is
        // right far more often than it is wrong, and an empty box is a box everybody has to fill.
        slotLabel: `A${String(current.length + 1)}`,
        basePoints: 100,
        setLabel: "A",
      },
    ]);
  };

  const patch = (problemId: string, change: Partial<Slot>): void => {
    setSaved(false);
    setSlots((current) =>
      current.map((slot) => (slot.problemId === problemId ? { ...slot, ...change } : slot)),
    );
  };

  const remove = (problemId: string): void => {
    setSaved(false);
    setSlots((current) => current.filter((slot) => slot.problemId !== problemId));
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/admin/contests/${contestId}/problems`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "Line-up set from the problem bank",
          problems: slots.map((slot) => ({
            problemId: slot.problemId,
            slotLabel: slot.slotLabel,
            basePoints: slot.basePoints,
            // Blank means GROUP. Trimmed, because a space is not a set.
            setLabel: slot.setLabel.trim() === "" ? null : slot.setLabel.trim(),
            divisionId: null,
          })),
        }),
      });
      if (!response.ok) {
        const body: unknown = await response.json();
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: { message?: unknown } }).error.message ?? "")
            : "";
        setError(message === "" ? "That line-up was refused." : message);
        return;
      }
      setSaved(true);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  if (bank.status === "loading") {
    return (
      <p role="status" className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        Loading the problem bank…
      </p>
    );
  }
  if (bank.status === "error" || bank.data === null) {
    return (
      <AlertPlate tone="alarm" title="The problem bank could not be loaded">
        {bank.error ?? "Unknown error."}
      </AlertPlate>
    );
  }

  const chosen = new Set(slots.map((s) => s.problemId));
  const needle = filter.trim().toLowerCase();
  const available = bank.data.filter(
    (p) =>
      !chosen.has(p.problemId) &&
      (needle === "" || p.title.toLowerCase().includes(needle) || p.slug.includes(needle)),
  );

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="This contest's line-up"
        aside={
          <span className="numeric text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
            {slots.length} {slots.length === 1 ? "problem" : "problems"}
          </span>
        }
        description="Saving REPLACES the whole line-up. Leave the set blank to make a problem a GROUP problem — every team works it, whichever set a player was assigned."
      >
        {slots.length === 0 ? (
          <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            Nothing chosen yet. Pick from the bank below.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ fontSize: "var(--text-sm)" }}>
              <thead>
                <tr className="border-b border-ink/15 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
                  <th scope="col" className="w-full py-2 pr-3 text-left font-semibold">Problem</th>
                  <th scope="col" className="py-2 pr-3 text-left font-semibold">Slot</th>
                  <th scope="col" className="py-2 pr-3 text-left font-semibold">Points</th>
                  <th scope="col" className="py-2 pr-3 text-left font-semibold">Set</th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => (
                  <tr key={slot.problemId} className="border-b border-ink/10">
                    <td className="py-2 pr-3">{slot.title}</td>
                    <td className="py-2 pr-3">
                      <input
                        aria-label={`Slot label for ${slot.title}`}
                        value={slot.slotLabel}
                        onChange={(e) => patch(slot.problemId, { slotLabel: e.target.value })}
                        className="numeric w-24 rounded border border-ink/25 bg-paper px-2 py-1"
                        style={{ fontSize: "var(--text-sm)" }}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        aria-label={`Base points for ${slot.title}`}
                        type="number"
                        min={0}
                        value={slot.basePoints}
                        onChange={(e) =>
                          patch(slot.problemId, { basePoints: Number(e.target.value) || 0 })
                        }
                        className="numeric w-24 rounded border border-ink/25 bg-paper px-2 py-1"
                        style={{ fontSize: "var(--text-sm)" }}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        aria-label={`Set for ${slot.title} — blank for a group problem`}
                        value={slot.setLabel}
                        placeholder="group"
                        onChange={(e) => patch(slot.problemId, { setLabel: e.target.value })}
                        className="numeric w-20 rounded border border-ink/25 bg-paper px-2 py-1"
                        style={{ fontSize: "var(--text-sm)" }}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => remove(slot.problemId)}
                        className="text-panther underline underline-offset-2"
                        style={{ fontSize: "var(--text-xs)" }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error !== null && (
          <p role="alert" className="mt-4 font-semibold text-panther" style={{ fontSize: "var(--text-sm)" }}>
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save this line-up"}
          </Button>
          {saved && (
            <span role="status" className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
              Saved. Publish the contest when the line-up is settled.
            </span>
          )}
        </div>
      </Panel>

      <Panel
        title="Problem bank"
        aside={
          <span className="numeric text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
            {available.length} of {bank.data.length}
          </span>
        }
        description="Every problem in the database. A problem that is not ready can still be slotted now — the API refuses a DRAFT in a live contest, and the reasons are shown so the refusal is never a surprise."
      >
        <label className="flex flex-col gap-1" style={{ fontSize: "var(--text-sm)" }}>
          Search
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="title or slug"
            className="max-w-sm rounded border border-ink/25 bg-paper px-3 py-2"
            style={{ fontSize: "var(--text-sm)" }}
          />
        </label>

        <ul className="mt-4 flex flex-col">
          {available.slice(0, 60).map((problem) => (
            <li
              key={problem.problemId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-ink/10 py-2.5"
            >
              <span className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
                {problem.title}
              </span>
              <ProblemStatePill state={problem.state} />
              {problem.difficulty !== null && (
                <span className="numeric text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
                  {problem.difficulty}
                </span>
              )}
              <span className="numeric text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
                {problem.testCaseCount} tests · {problem.sampleCaseCount} sample
              </span>

              {problem.readyBlockers.length > 0 && (
                <span className="text-panther" style={{ fontSize: "var(--text-xs)" }}>
                  {problem.readyBlockers.join("; ")}
                </span>
              )}

              <span className="ml-auto">
                <Button type="button" variant="secondary" onClick={() => add(problem)}>
                  Add
                </Button>
              </span>
            </li>
          ))}
        </ul>

        {available.length > 60 && (
          <p className="mt-3 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
            Showing the first 60 of {available.length}. Narrow the search rather than scrolling —
            and note this is a cap on what is DRAWN, not on what exists.
          </p>
        )}
      </Panel>
    </div>
  );
}
