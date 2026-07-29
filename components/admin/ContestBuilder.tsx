"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Select, TextInput } from "@/components/admin/Field";
import { AlertPlate, Panel } from "@/components/admin/Panel";
import {
  ContestDraftSchema,
  SCORING_PRESETS,
  type ContestDraft,
  type DivisionDraft,
  type ScoringPresetId,
} from "@/components/admin/contract";

/**
 * Contest builder — name, window, divisions, scoring preset, join code, freeze time
 * (PRD §9.2).
 *
 * Validation is `ContestDraftSchema`, the same Zod schema the route will parse, so the form
 * cannot drift from the server's idea of a valid contest. The client check is a courtesy;
 * the API is the authority.
 */

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0, no I/1

function generateJoinCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length] ?? "X").join("");
}

const EMPTY_DRAFT: ContestDraft = {
  name: "",
  startsAtLocal: "",
  endsAtLocal: "",
  freezeAtLocal: "",
  joinCode: "",
  scoringPresetId: "classic",
  divisions: [
    { key: "d1", name: "Intermediate" },
    { key: "d2", name: "Advanced" },
  ],
};

type Errors = Readonly<Record<string, string>>;

function toPresetId(value: string): ScoringPresetId {
  const match = SCORING_PRESETS.find((p) => p.id === value);
  return match?.id ?? "classic";
}

function collectErrors(draft: ContestDraft): Errors {
  const parsed = ContestDraftSchema.safeParse(draft);
  if (parsed.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "form";
    // First issue per field wins — a stack of three messages under one input is noise.
    if (errors[key] === undefined) errors[key] = issue.message;
  }
  return errors;
}

export interface ContestBuilderProps {
  initial?: ContestDraft;
}

export function ContestBuilder({ initial = EMPTY_DRAFT }: ContestBuilderProps) {
  const [draft, setDraft] = useState<ContestDraft>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof ContestDraft>(key: K, value: ContestDraft[K]): void => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
  };

  const renameDivision = (key: string, name: string): void => {
    update(
      "divisions",
      draft.divisions.map((d) => (d.key === key ? { ...d, name } : d)),
    );
  };

  const addDivision = (): void => {
    const next: DivisionDraft = { key: `d${Date.now()}`, name: "" };
    update("divisions", [...draft.divisions, next]);
  };

  const removeDivision = (key: string): void => {
    update(
      "divisions",
      draft.divisions.filter((d) => d.key !== key),
    );
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = collectErrors(draft);
    setErrors(found);
    // No route to call yet: `app/api/**` belongs to backend-api and does not exist in this
    // worktree. When it does, this is the single place that POSTs the parsed draft.
    setSaved(Object.keys(found).length === 0);
  };

  const preset = SCORING_PRESETS.find((p) => p.id === draft.scoringPresetId);
  const divisionError = errors["divisions"];

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Panel
        title="Contest"
        description="The window, the join code and the freeze time are the four things nobody wants to be editing at 6:55pm. Set them now."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput
            label="Contest name"
            required
            value={draft.name}
            maxLength={120}
            error={errors["name"] ?? null}
            onChange={(e) => update("name", e.target.value)}
          />

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextInput
                label="Join code"
                required
                numeric
                value={draft.joinCode}
                error={errors["joinCode"] ?? null}
                hint="Read aloud to a room. Ambiguous characters are left out of the generator."
                onChange={(e) => update("joinCode", e.target.value.toUpperCase())}
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => update("joinCode", generateJoinCode())}>
              Generate
            </Button>
          </div>

          <TextInput
            label="Starts at"
            type="datetime-local"
            required
            numeric
            value={draft.startsAtLocal}
            error={errors["startsAtLocal"] ?? null}
            onChange={(e) => update("startsAtLocal", e.target.value)}
          />

          <TextInput
            label="Ends at"
            type="datetime-local"
            required
            numeric
            value={draft.endsAtLocal}
            error={errors["endsAtLocal"] ?? null}
            onChange={(e) => update("endsAtLocal", e.target.value)}
          />

          <TextInput
            label="Freeze at"
            type="datetime-local"
            numeric
            value={draft.freezeAtLocal}
            error={errors["freezeAtLocal"] ?? null}
            hint="After this the public board stops updating while judging continues. Leave blank for no freeze."
            onChange={(e) => update("freezeAtLocal", e.target.value)}
          />

          <Select
            label="Scoring preset"
            required
            value={draft.scoringPresetId}
            error={errors["scoringPresetId"] ?? null}
            hint={preset?.summary}
            onChange={(e) => update("scoringPresetId", toPresetId(e.target.value))}
          >
            {SCORING_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </Panel>

      <Panel
        title="Divisions"
        description="Divisions rank independently — there is an Intermediate winner and an Advanced winner (PRD §6.1)."
        aside={
          <span className="numeric opacity-70" style={{ fontSize: "var(--text-xs)" }}>
            {draft.divisions.length} division{draft.divisions.length === 1 ? "" : "s"}
          </span>
        }
      >
        <ul className="flex flex-col gap-3">
          {draft.divisions.map((division, index) => (
            <li key={division.key} className="flex items-end gap-2">
              <span
                className="numeric pb-2 opacity-60"
                style={{ fontSize: "var(--text-xs)" }}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <div className="flex-1">
                <TextInput
                  label={`Division ${index + 1} name`}
                  required
                  value={division.name}
                  maxLength={40}
                  error={errors[`divisions.${index}.name`] ?? null}
                  onChange={(e) => renameDivision(division.key, e.target.value)}
                />
              </div>
              <ConfirmButton
                label="Remove"
                confirmLabel="Remove division"
                disabled={draft.divisions.length === 1}
                onConfirm={() => removeDivision(division.key)}
              />
            </li>
          ))}
        </ul>

        {divisionError !== undefined && (
          <p role="alert" className="mt-3 font-semibold text-panther" style={{ fontSize: "var(--text-xs)" }}>
            {divisionError}
          </p>
        )}

        <div className="mt-4">
          <Button type="button" variant="secondary" onClick={addDivision}>
            Add division
          </Button>
        </div>
      </Panel>

      {Object.keys(errors).length > 0 && (
        <AlertPlate tone="alarm" title="This contest will not save yet">
          <ul className="list-disc pl-5">
            {Object.entries(errors).map(([field, message]) => (
              <li key={field}>{message}</li>
            ))}
          </ul>
        </AlertPlate>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Save contest</Button>
        {saved && (
          <span role="status" className="font-semibold text-panther" style={{ fontSize: "var(--text-sm)" }}>
            Draft is valid. Wiring to the API lands with the admin routes.
          </span>
        )}
      </div>
    </form>
  );
}
