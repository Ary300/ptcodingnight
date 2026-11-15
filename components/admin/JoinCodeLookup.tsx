"use client";

import { useState } from "react";

import { TextInput } from "@/components/admin/Field";
import { Panel } from "@/components/admin/Panel";
import { Button } from "@/components/ui";
import {
  API_ROUTES,
  AdminWhoseCodeResponseSchema,
  type AdminWhoseCode,
} from "@/lib/schemas/api";

/**
 * The desk lookup: type a code, learn whose it is.
 *
 * This is the feature a team prefix inside the code was really asking for. An organizer at the
 * door holding an unlabelled slip, or hearing "my code does not work", needs to know which
 * student and which team a code belongs to. Encoding the team into the code would answer that
 * once and then lie the first time somebody changes teams; resolving it on demand answers it
 * every time and stays true.
 *
 * It reads a seat and never opens one: no session is issued here, so an organizer checking a
 * code does not accidentally sign themselves in as a student.
 */
export function JoinCodeLookup() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<AdminWhoseCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const look = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      const response = await fetch(API_ROUTES.adminWhoseCode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload
            ? (payload as { error: { message?: string } }).error.message
            : undefined;
        setError(message ?? "That code does not match anybody.");
        return;
      }
      const data =
        typeof payload === "object" && payload !== null && "data" in payload
          ? (payload as { data: unknown }).data
          : null;
      const parsed = AdminWhoseCodeResponseSchema.safeParse(data);
      if (parsed.success) setFound(parsed.data);
      else setError("The server returned an unexpected response.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Look up a code"
      level="framed"
      description="Somebody hands you a slip with no name on it, or says their code will not work. Type it here to see whose seat it is."
    >
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.trim() === "") return;
          void look();
        }}
      >
        <div className="w-48">
          <TextInput
            label="Join code"
            value={code}
            placeholder="7K4Q9M"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={busy || code.trim() === ""}>
          {busy ? "Looking…" : "Look it up"}
        </Button>
      </form>

      {error !== null && (
        <p role="alert" className="motion-swap-in mt-group font-semibold text-panther" style={{ fontSize: "var(--text-sm)" }}>
          {error}
        </p>
      )}

      {found !== null && (
        <div className="motion-swap-in mt-group rounded-panel border border-rule-hair p-4">
          <p className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
            {found.displayName}
          </p>
          <p className="mt-1 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            {[
              found.teamName === null ? "on no team yet" : `on ${found.teamName}`,
              found.divisionName,
              found.setLabel === null ? null : `set ${found.setLabel}`,
            ]
              .filter((part) => part !== null && part !== "")
              .join(", ")}
          </p>
          <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            {found.contestName} ({found.contestState.toLowerCase()})
          </p>
        </div>
      )}
    </Panel>
  );
}
