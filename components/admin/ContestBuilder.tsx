"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Select, TextInput } from "@/components/admin/Field";
import { Panel } from "@/components/admin/Panel";
import {
  ContestDraftSchema,
  SCORING_PRESETS,
  type ContestDraft,
  type DivisionDraft,
  type ScoringPresetId,
} from "@/components/admin/contract";

/**
 * Contest builder — name, window, divisions, scoring preset, freeze time (PRD §9.2).
 *
 * Validation is `ContestDraftSchema`, the same Zod schema the route will parse, so the form
 * cannot drift from the server's idea of a valid contest. The client check is a courtesy;
 * the API is the authority.
 *
 * ## The shape is HackerRank's Contest Details page, on purpose
 *
 * Measured from their contest settings screen: ONE column of fields, each label above its
 * control with a hint line in lighter ink beneath it, sections led by a heading and separated
 * by a hairline rule rather than boxed into cards, and exactly one filled button on the page.
 * The two-column grid this used to be put "Starts at" beside "Contest name" and "Freeze at"
 * beside "Ends at", so the reading order of the fields and the meaning order of the fields
 * disagreed. A settings form is a list you go down, not a grid you scan.
 *
 * The column is capped at `max-w-2xl` because a full-bleed text input on a wide admin window
 * is a 1200px-long box for a 30-character name.
 *
 * ## A rejected form is answered at the field, never with a plate
 *
 * The old error summary was a black `AlertPlate` titled "This contest will not save yet" —
 * exactly the rendering `components/admin/Panel.tsx` forbids for validation, because a black
 * plate reads as "something is wrong with the judge" and pulls the eye away from the field
 * that needs fixing. Each field already announces its own error through `Field`'s
 * `aria-describedby` wiring; what remains here is one quiet line beside the submit button, so
 * pressing Create with a bad field off-screen still visibly does something.
 *
 * ## Creating is a DOORWAY, not a form you are left sitting on
 *
 * It used to set a `saved` flag and leave the form filled with a live "Create contest" button,
 * so pressing it again made a second identical contest. There is now exactly ONE destination:
 * `/admin/contests/<id>`, whose tab strip carries the id by construction. A successful create
 * navigates there and this form is unmounted, so it cannot be submitted twice.
 */

const EMPTY_DRAFT: ContestDraft = {
  name: "",
  startsAtLocal: "",
  endsAtLocal: "",
  freezeAtLocal: "",
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
  const router = useRouter();
  const [draft, setDraft] = useState<ContestDraft>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const update = <K extends keyof ContestDraft>(
    key: K,
    value: ContestDraft[K],
  ): void => {
    setDraft((previous) => ({ ...previous, [key]: value }));
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

  /**
   * Create the contest, then go and stand inside it.
   *
   * `datetime-local` yields wall-clock text with no zone, which is not an instant. `new Date(...)`
   * on that string resolves it in the BROWSER's zone, which is the organizer's, which is the one
   * they typed it in. Converting here rather than sending the raw string is what stops a contest
   * starting an hour early on a server set to UTC.
   *
   * `busy` is deliberately NOT cleared on the success path: `router.push` is asynchronous, and a
   * form that becomes pressable again during the navigation is a form that can create the contest
   * twice. It clears on every failure, which is the only case where pressing again is right.
   */
  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const found = collectErrors(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    setFormError(null);
    try {
      const response = await fetch("/api/admin/contests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          startsAt: new Date(draft.startsAtLocal).toISOString(),
          endsAt: new Date(draft.endsAtLocal).toISOString(),
          freezeAt:
            draft.freezeAtLocal === ""
              ? null
              : new Date(draft.freezeAtLocal).toISOString(),
          scoringPresetId: draft.scoringPresetId,
          divisions: draft.divisions.map((d) => d.name),
        }),
      });

      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? String(
                (body as { error: { message?: unknown } }).error.message ?? "",
              )
            : "";
        setFormError(
          message === "" ? "That contest could not be created." : message,
        );
        setBusy(false);
        return;
      }

      const id =
        typeof body === "object" && body !== null && "data" in body
          ? (body as { data: { contestId?: unknown } }).data.contestId
          : null;

      if (typeof id !== "string" || id === "") {
        // The contest exists — the POST succeeded — but the response did not name it, so there is
        // nowhere specific to send the organizer. Say so rather than pretending, and point at the
        // list, where it will be the newest row.
        setFormError(
          "The contest was created, but the server did not return its id. Open it from Contests.",
        );
        setBusy(false);
        return;
      }

      router.push(`/admin/contests/${encodeURIComponent(id)}`);
    } catch {
      setFormError("Could not reach the server.");
      setBusy(false);
    }
  };

  const preset = SCORING_PRESETS.find((p) => p.id === draft.scoringPresetId);
  const divisionError = errors["divisions"];
  const errorCount = Object.keys(errors).length;

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      className="flex max-w-2xl flex-col gap-6"
    >
      <Panel
        level="bare"
        title="Contest details"
        description="Set the contest schedule and scoring. New contests stay private until you publish them."
      >
        <div className="flex flex-col gap-group">
          <TextInput
            label="Contest name"
            required
            value={draft.name}
            maxLength={120}
            error={errors["name"] ?? null}
            hint="Students see this name on the sign-in screen and the projector."
            onChange={(e) => update("name", e.target.value)}
          />

          <TextInput
            label="Starts at"
            type="datetime-local"
            required
            numeric
            value={draft.startsAtLocal}
            error={errors["startsAtLocal"] ?? null}
            hint="Enter the start in your local time zone."
            onChange={(e) => update("startsAtLocal", e.target.value)}
          />

          <TextInput
            label="Ends at"
            type="datetime-local"
            required
            numeric
            value={draft.endsAtLocal}
            error={errors["endsAtLocal"] ?? null}
            hint="Submissions close here. Must fall after the start."
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
            onChange={(e) =>
              update("scoringPresetId", toPresetId(e.target.value))
            }
          >
            {SCORING_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </Panel>

      {/*
        Divisions are a repeatable ROW LIST: each division is its own bordered card with its
        fields inside it and a worded Remove control, the shape HackerRank uses for anything
        you can have N of. The old rendering was an input with a floating index digit on its
        left and a red button hanging off its right, which is three loose objects per division
        rather than one thing you can point at and say "that is division two".

        The section itself stays UNBOXED (`level="bare"`, a hairline rule above it, exactly as
        the reference separates Contest Details from Landing Page Customization) precisely so
        the cards inside it read as the bounded objects. Framing both puts boxes in boxes and
        neither reads as the row list.
      */}
      <Panel
        level="bare"
        className="border-t border-rule-edge pt-6"
        title="Divisions"
        description="Each division has its own standings and winner."
        aside={
          <span
            className="numeric opacity-70"
            style={{ fontSize: "var(--text-xs)" }}
          >
            {draft.divisions.length} division
            {draft.divisions.length === 1 ? "" : "s"}
          </span>
        }
      >
        <ul className="flex flex-col gap-3">
          {draft.divisions.map((division, index) => (
            <li
              key={division.key}
              className="rounded-panel border border-rule-edge bg-paper p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/*
                    The index lives in the label, so the accessible name of every name field is
                    distinct — three inputs all announced as "Division name" would leave a screen
                    reader user guessing which one the duplicate-name error is about.
                  */}
                  <TextInput
                    label={`Division ${index + 1} name`}
                    required
                    value={division.name}
                    maxLength={40}
                    error={errors[`divisions.${index}.name`] ?? null}
                    onChange={(e) =>
                      renameDivision(division.key, e.target.value)
                    }
                  />
                </div>
                {/*
                  A worded, two-step Remove rather than a bare ×: it deletes typed content, and
                  `quiet` because it is a row action — the Button docstring's rule that in-row
                  actions are text, and only the page's one primary action is filled.
                */}
                <ConfirmButton
                  label="Remove"
                  confirmLabel="Remove division"
                  variant="quiet"
                  size="sm"
                  disabled={draft.divisions.length === 1}
                  onConfirm={() => removeDivision(division.key)}
                />
              </div>
            </li>
          ))}
        </ul>

        {divisionError !== undefined && (
          <p
            role="alert"
            className="mt-3 font-semibold text-panther"
            style={{ fontSize: "var(--text-xs)" }}
          >
            {divisionError}
          </p>
        )}

        <div className="mt-4">
          <Button type="button" variant="secondary" onClick={addDivision}>
            Add division
          </Button>
        </div>
      </Panel>

      {/*
        The action bar HackerRank puts at the foot of its contest admin. It carries one action,
        because there is one thing to do: bring the contest into existence. Refusals — the
        client's own validation and the server's — answer HERE as a quiet line in the accent
        ink, not as a black plate: Panel.tsx reserves plates for standing conditions, and a
        rejected form is answered at the field, with this line only saying that fields above
        are marked.
      */}
      <div className="flex flex-col gap-3 border-t border-rule-edge pt-4">
        {errorCount > 0 && (
          <p
            role="alert"
            className="font-semibold text-panther"
            style={{ fontSize: "var(--text-sm)" }}
          >
            This contest will not save yet: fix the {errorCount} marked field
            {errorCount === 1 ? "" : "s"} above.
          </p>
        )}

        {formError !== null && (
          <p
            role="alert"
            className="font-semibold text-panther"
            style={{ fontSize: "var(--text-sm)" }}
          >
            {formError}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className="max-w-[60ch] text-ink/70"
            style={{ fontSize: "var(--text-sm)" }}
          >
            Created as a <strong>DRAFT</strong>. Students cannot see it. You
            will land on the contest, with its problems, roster and side
            activities as tabs.
          </p>

          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create contest"}
          </Button>
        </div>
      </div>
    </form>
  );
}
