"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";

/**
 * Run Round 1 problem-set assignment.
 *
 * ## Why this button did not exist
 *
 * `POST /api/admin/contests/{id}/assign-sets` was written, tested and called by **nothing in the
 * product** — the only callers in the repository are `tests/e2e/helpers/api.ts`. A player with no
 * `chosenSetId` can open the group problems and nothing else, so a contest published before
 * assignment ran put the whole room on two problems and gave no clue why.
 *
 * ## It only offers the FIRST run
 *
 * The route also takes `reassign: true`, and this never sends it. Re-assigning moves students off
 * problems they may already have started; that is a deliberate, explainable act, not something to
 * be one stray click away on a setup checklist. It stays reachable through the API, and the seed
 * is stored so any assignment can be re-derived and shown (PRD §6.2).
 */

export function AssignSetsButton({ contestId }: { readonly contestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      // No body at all: the route reads one only when `content-length` is non-zero, and both of
      // its fields are for the re-run case.
      const response = await fetch(`/api/admin/contests/${contestId}/assign-sets`, {
        method: "POST",
      });
      if (!response.ok) {
        const body: unknown = await response.json();
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: { message?: unknown } }).error.message ?? "")
            : "";
        setError(message === "" ? "That assignment was refused." : message);
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" disabled={busy} onClick={() => void run()}>
        {busy ? "Assigning…" : "Assign problem sets"}
      </Button>
      {error !== null && (
        <p role="alert" className="font-semibold text-panther" style={{ fontSize: "var(--text-xs)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
