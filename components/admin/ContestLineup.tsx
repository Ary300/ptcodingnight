"use client";

import { useCallback, useId, useState, type ReactNode } from "react";

import {
  Button,
  CONTROL_FONT_SIZE,
  CONTROL_LEADING,
  CONTROL_PAD,
  CONTROL_SURFACE,
  Select,
  Stacked,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { useResource } from "@/components/contest/data/useResource";
import {
  AdminProblemBankSchema,
  type AdminProblemRow,
} from "@/lib/schemas/api";

import { TextInput } from "@/components/admin/Field";
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
 * ## The furniture is HackerRank's Challenges tab, deliberately
 *
 * Measured off the reference screenshot of a contest's admin (the "Contest Challenges" screen):
 * the pool you pick from is a real bordered table with a tinted header row, not a list of loose
 * rows; the pick affordance is a bordered secondary button; and the empty state is a bordered box
 * with centred muted text INSIDE the section it describes ("No challenges have been added yet."),
 * never a replacement for the screen. Both tables here come from `components/ui/DataTable`, which
 * is that grammar extracted once, and the inputs share their box with every other admin control
 * via `CONTROL_SURFACE` — the complaint this rework answers was four screens each drawing their
 * own control chrome.
 *
 * ## Slot, points and set are chosen HERE, not later
 *
 * The old flow deferred them to "the contest screen once the line-up is settled", and that screen
 * did not exist. They belong with the choice anyway: a problem's base points and which set it sits
 * in are what make it a slot in a contest rather than a row in a bank, and an organizer picking
 * problems is already thinking about the shape of the round.
 *
 * ## Individual or group is a CONTROL, and it used to be a blank field
 *
 * The two kinds of problem in this format are not variations on a theme. An INDIVIDUAL problem
 * belongs to one of the sets (A, B, C…), and every member of a team holds a different set, so
 * exactly one person on each team ever works it. A GROUP problem belongs to no set: the whole
 * team works it together, and every team gets the same ones. The contest-scoped
 * `ContestProblem.round` stores that choice, while `setId` stores the compatible set assignment.
 *
 * This screen used to encode it as *leave the set box blank and it becomes a group problem*. The
 * defect in that is not that it is hard to discover, though it is: it is that **the two states
 * are drawn identically.** An organizer who meant "group" and an organizer who has not filled the
 * box in yet produce the same row, and the screen cannot tell them apart, so it cannot warn
 * either of them. The failure mode runs in the direction that hurts: the row still had a default
 * set of "A" from Add, so a problem the organizer intended the whole team to work together was
 * quietly handed to whichever one member of each team held set A, and nothing anywhere said so
 * until the round was running and three quarters of the room had never seen the question. A
 * blank field that silently means something is exactly how that happens.
 *
 * So the kind is chosen, in words, per row. The set label control is shown only when Individual
 * is chosen, and choosing Group CLEARS it, because a set label on a group problem is a
 * contradiction the data cannot express: there is one `setId` column and it is either a set or
 * null. And an Individual problem with no set label now blocks Save rather than silently saving
 * as a group problem, because a designation the organizer can read on screen and the row that
 * gets written have to agree, which is the entire point of making it explicit.
 *
 * The request carries both `round` and `setLabel`, so the server can reject a contradictory row
 * rather than inferring the scoring rule from a blank field.
 *
 * ## Add and Remove edit a draft, and the screen says so
 *
 * `PUT` replaces the whole line-up in one shot, so Add and Remove write NOTHING until Save is
 * pressed. That is the right transactional shape — an organizer half-way through a reshuffle must
 * not have a projector board reflecting the half — but it used to be a secret: the buttons looked
 * like they acted, and closing the tab threw the work away silently. The draft state is now named
 * on screen ("Not saved yet") from the first edit until the save lands, and the header count
 * carries the same flag so it is visible even with the footer scrolled away.
 *
 * ## Duplicate slot labels are rejected here, not just downstream
 *
 * The slot label is the board's ordering key, so two problems sharing one breaks deterministic
 * ordering — the standings replay guarantee, not a cosmetic nit. The offending inputs are marked
 * and the message names the duplicated label, because "something is wrong somewhere in this
 * table" is exactly the kind of refusal the organizer called confusing. Save stays disabled until
 * every problem has its own label.
 *
 * ## It opens showing what is ALREADY in the contest
 *
 * `PUT /api/admin/contests/{id}/problems` replaces the whole line-up and there is no GET beside
 * it, so this used to mount with an empty basket every time. The Problems tab of a contest holding
 * six problems therefore read "Nothing chosen yet", and the only button on the screen — Save —
 * deleted all six. The server component that renders this reads the stored slots and passes them
 * as `initial`, so Save means "save what I can see".
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
  /**
   * The line-up as it is stored right now, so the basket starts full rather than empty.
   *
   * Read on the server by the page, because there is no GET route for a contest's problems — only
   * the PUT that replaces them. Optional so the component still works where no line-up is known.
   */
  readonly initial?: readonly StoredSlot[];
}

/** Individual: it sits in one set, so one member of each team works it. Group: no set, whole team. */
type SlotKind = "individual" | "group";

/**
 * A line-up row as the server hands it down. Round is explicit because the same problem-bank row
 * may be used differently in different contests.
 */
export interface StoredSlot {
  readonly problemId: string;
  readonly title: string;
  readonly slotLabel: string;
  readonly basePoints: number;
  readonly round: "INDIVIDUAL" | "GROUP";
  readonly setLabel: string;
}

/** A row while it is being edited: the stored shape plus the kind the organizer chose, explicitly. */
type Slot = Omit<StoredSlot, "round"> & {
  readonly kind: SlotKind;
};

/**
 * Read the stored rows into editable ones.
 *
 * The database round is the source of truth. A set label can no longer silently decide scoring.
 */
function withKind(stored: readonly StoredSlot[]): readonly Slot[] {
  return stored.map(({ round, ...slot }): Slot => ({
    ...slot,
    kind: round === "GROUP" ? "group" : "individual",
  }));
}

/** DRAFT problems are 121 of the 130 in the bank, and none of them may go in a live contest. */
type BankFilter = "ready" | "all";

/**
 * The in-row control box: the same surface every admin input and select stands on, at the `sm`
 * metrics the editor's toolbar uses, because a table row is dense chrome. Copying the class
 * string instead of importing it is how the four-different-dropdowns complaint happened.
 */
const ROW_CONTROL = `${CONTROL_SURFACE} ${CONTROL_PAD.sm} ${CONTROL_LEADING.sm} numeric placeholder:text-ink/60`;

function rowControlBorder(invalid: boolean): string {
  // Either/or, never both: two border-color utilities on one element resolve by emission
  // order, not class-list order, the same trap components/ui/Select.tsx documents.
  return invalid ? "border-panther" : "border-rule-edge hover:border-rule-firm";
}

/**
 * HackerRank's empty state, copied: a bordered box with centred muted text sitting INSIDE the
 * section it describes. Never a whole-screen replacement — that is the bug the bank's loading
 * state used to be, and the placement is the fix.
 */
function PanelNote({
  status,
  children,
}: {
  status?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role={status === true ? "status" : undefined}
      className="rounded-panel border border-rule-edge px-4 py-8 text-center text-ink/70"
      style={{ fontSize: "var(--text-sm)" }}
    >
      {children}
    </div>
  );
}

/** Labels that appear on more than one problem, trimmed, blanks excluded (they get their own message). */
function duplicateSlotLabels(slots: readonly Slot[]): readonly string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const slot of slots) {
    const label = slot.slotLabel.trim();
    if (label === "") continue;
    if (seen.has(label)) {
      dupes.add(label);
    } else {
      seen.add(label);
    }
  }
  return [...dupes];
}

/** Order matters: the PUT replaces the list as given, so a reorder is a real change. */
function sameLineup(a: readonly Slot[], b: readonly Slot[]): boolean {
  return (
    a.length === b.length &&
    a.every((slot, i) => {
      const other = b[i];
      return (
        other !== undefined &&
        slot.problemId === other.problemId &&
        slot.slotLabel === other.slotLabel &&
        slot.basePoints === other.basePoints &&
        slot.setLabel === other.setLabel &&
        // The kind is compared even though a group row and a set-less individual row would PUT
        // the same bytes, because the screen displays the kind: flipping Group to Individual
        // changes what the organizer is looking at, and "not saved yet" has to mean "what you can
        // see is not what is stored". The row is unsaveable until a set label is typed anyway.
        slot.kind === other.kind
      );
    })
  );
}

async function loadBank(): Promise<readonly AdminProblemRow[]> {
  const response = await fetch("/api/admin/problems", { cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: { message?: unknown } }).error.message ?? "")
        : "";
    throw new Error(
      message === "" ? "The problem bank could not be loaded." : message,
    );
  }
  const data =
    typeof body === "object" && body !== null && "data" in body
      ? (body as { data: unknown }).data
      : body;
  return AdminProblemBankSchema.parse(data).problems;
}

export function ContestLineup({ contestId, initial = [] }: ContestLineupProps) {
  const bank = useResource(useCallback(() => loadBank(), []));

  const [slots, setSlots] = useState<readonly Slot[]>(() => withKind(initial));
  // What the server currently holds, as far as this screen knows. `slots` differing from it is
  // the definition of "unsaved changes", which bug (b) requires the screen to name.
  // Read through the same `withKind`, so opening a saved line-up is never dirty on arrival.
  const [savedSlots, setSavedSlots] = useState<readonly Slot[]>(() =>
    withKind(initial),
  );
  const [filter, setFilter] = useState("");
  const [bankFilter, setBankFilter] = useState<BankFilter>("ready");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lineupErrorId = useId();

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
        // Individual with set A is the common case and is what the old default already produced.
        // It is safe to default only because it is now VISIBLE as a choice: the reason the same
        // default used to be dangerous is that a row meant to be a group problem carried it
        // silently, with nothing on screen contradicting the organizer's intention.
        kind: "individual",
        setLabel: "A",
      },
    ]);
  };

  const patch = (problemId: string, change: Partial<Slot>): void => {
    setSaved(false);
    setSlots((current) =>
      current.map((slot) =>
        slot.problemId === problemId ? { ...slot, ...change } : slot,
      ),
    );
  };

  const remove = (problemId: string): void => {
    setSaved(false);
    setSlots((current) =>
      current.filter((slot) => slot.problemId !== problemId),
    );
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(
        `/api/admin/contests/${contestId}/problems`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reason: "Line-up set from the problem bank",
            problems: slots.map((slot) => ({
              problemId: slot.problemId,
              slotLabel: slot.slotLabel,
              basePoints: slot.basePoints,
              round: slot.kind === "group" ? "GROUP" : "INDIVIDUAL",
              // Trimmed, because a space is not a set label; an individual row that trims to nothing
              // cannot reach here, since Save is disabled while one exists.
              setLabel: slot.kind === "group" ? null : slot.setLabel.trim(),
              divisionId: null,
            })),
          }),
        },
      );
      if (!response.ok) {
        const body: unknown = await response.json();
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? String(
                (body as { error: { message?: unknown } }).error.message ?? "",
              )
            : "";
        setError(message === "" ? "That line-up was refused." : message);
        return;
      }
      setSaved(true);
      setSavedSlots(slots);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  /*
    THE LINE-UP IS NOT GATED ON THE BANK, and it used to be.

    These two early returns stood in front of the WHOLE component, so a slow `GET
    /api/admin/problems` blanked the line-up table as well — even though that table needs no
    network at all: the server component hands it down as `initial`. Measured: the Problems tab
    read "Loading the problem bank" for 145 SECONDS, with the line-up rows arriving 4ms after the
    bank rows, which is what proved they were gated together.

    That was the real answer to "very confusing how to add problems and where all that is". It was
    not confusing. The organizer was looking at an empty panel.

    (The 145s itself is fixed too — `lib/contest/problem-bank.ts` was selecting every problem's
    full statement to ask whether it was empty. That route now answers in ~30ms. Both halves
    mattered: a fast query still should not be able to hide a panel that does not depend on it.)

    So the bank's loading and error states are rendered INSIDE its own panel, below, and the
    line-up renders immediately.
  */
  // Empty until the bank arrives. The line-up below does not consult it.
  const bankRows = bank.data ?? [];

  const chosen = new Set(slots.map((s) => s.problemId));
  const needle = filter.trim().toLowerCase();
  const readyCount = bankRows.filter(
    (p) => p.readyBlockers.length === 0,
  ).length;
  const available = bankRows.filter(
    (p) =>
      !chosen.has(p.problemId) &&
      (bankFilter === "all" || p.readyBlockers.length === 0) &&
      (needle === "" ||
        p.title.toLowerCase().includes(needle) ||
        p.slug.includes(needle)),
  );

  const duplicates = duplicateSlotLabels(slots);
  const blankCount = slots.filter(
    (slot) => slot.slotLabel.trim() === "",
  ).length;
  /*
    An Individual row with no set label is a REFUSAL, not a silent group problem.

    This is the whole reason the choice is worth a control. Under the old convention the two were
    the same row, so the only thing the screen could do with an empty box was guess, and it guessed
    "group" — which is how a problem meant for one set could end up worked by every team, or the
    reverse, with no warning either way. Now the organizer has said which one they mean, so an
    Individual row that names no set is a stated intention the data cannot carry, and the right
    answer is to stop and say so rather than to save the opposite of what is on screen.
  */
  const setMissingCount = slots.filter(
    (slot) => slot.kind === "individual" && slot.setLabel.trim() === "",
  ).length;
  const slotLabelBlocked = duplicates.length > 0 || blankCount > 0;
  const lineupBlocked = slotLabelBlocked || setMissingCount > 0;
  const dirty = !sameLineup(slots, savedSlots);

  // The closing sentence of the refusal, which has to name the way out of whichever fault is
  // actually present. "Give every problem its own slot label to save." in front of a line-up whose
  // only fault is a missing set is the sort of message that sends an organizer hunting through a
  // column that is already correct.
  let lineupBlockedFix: string;
  if (slotLabelBlocked && setMissingCount > 0) {
    lineupBlockedFix =
      "Give every problem its own slot label, and name a set on every individual problem, to save.";
  } else if (slotLabelBlocked) {
    lineupBlockedFix = "Give every problem its own slot label to save.";
  } else {
    lineupBlockedFix =
      "Name a set on each of those, or change them to Group, to save.";
  }

  const slotInvalid = (slot: Slot): boolean => {
    const label = slot.slotLabel.trim();
    return label === "" || duplicates.includes(label);
  };

  const setInvalid = (slot: Slot): boolean =>
    slot.kind === "individual" && slot.setLabel.trim() === "";

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="This contest's line-up"
        aside={
          // Open Sans, not `numeric`: the mono face is for digit runs that align in a column,
          // and this is a phrase that happens to start with a number.
          <span className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
            {slots.length} {slots.length === 1 ? "problem" : "problems"}
            {/* The draft flag rides with the count so it stays visible when the Save row has
                scrolled away under a long table. Words, not colour: DESIGN.md §3. */}
            {dirty ? " (not saved yet)" : ""}
          </span>
        }
        description="Individual questions belong to one set. Group questions are shared by every team. Saving updates the full line-up."
      >
        {slots.length === 0 ? (
          <PanelNote>Nothing chosen yet. Pick from the bank below.</PanelNote>
        ) : (
          // `relative` so the sr-only header labels resolve against THIS box, not the page:
          // absolutely positioned children of a static scroller land past the viewport's right
          // edge and grow the document's scrollWidth, which pans the whole page at 360.
          <div className="relative min-w-0 overflow-x-auto">
            {/* Wider than it was: the set column now holds a choice and its set label side by
                side. It scrolls inside its own box rather than pushing the page sideways. */}
            <Table caption="Problems in this contest" className="min-w-[44rem]">
              <THead>
                <TR>
                  <TH className="w-full">Problem</TH>
                  <TH>Slot</TH>
                  <TH>Points</TH>
                  {/* The heading names the decision rather than one of its two outcomes. "Set"
                      alone read as a box to fill in, which is how leaving it empty came to mean
                      something nobody had been told. */}
                  <TH>Individual or group</TH>
                  <TH>
                    <span className="sr-only">Remove</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {slots.map((slot) => {
                  const invalid = slotInvalid(slot);
                  const setMissing = setInvalid(slot);
                  return (
                    <TR key={slot.problemId}>
                      <TD className="font-semibold">{slot.title}</TD>
                      {/* Widths live on a wrapper: CONTROL_SURFACE already says `w-full`, and
                          two width utilities on one element resolve by emission order. */}
                      <TD>
                        <span className="inline-block w-20 align-middle">
                          <input
                            aria-label={`Slot label for ${slot.title}`}
                            aria-invalid={invalid || undefined}
                            aria-describedby={
                              invalid ? lineupErrorId : undefined
                            }
                            value={slot.slotLabel}
                            onChange={(e) =>
                              patch(slot.problemId, {
                                slotLabel: e.target.value,
                              })
                            }
                            className={`${ROW_CONTROL} ${rowControlBorder(invalid)}`}
                            style={{ fontSize: CONTROL_FONT_SIZE.sm }}
                          />
                        </span>
                      </TD>
                      <TD>
                        <span className="inline-block w-24 align-middle">
                          <input
                            aria-label={`Base points for ${slot.title}`}
                            type="number"
                            min={0}
                            value={slot.basePoints}
                            onChange={(e) =>
                              patch(slot.problemId, {
                                basePoints: Number(e.target.value) || 0,
                              })
                            }
                            className={`${ROW_CONTROL} ${rowControlBorder(false)}`}
                            style={{ fontSize: CONTROL_FONT_SIZE.sm }}
                          />
                        </span>
                      </TD>
                      <TD>
                        <span className="flex items-center gap-2">
                          <Select
                            size="sm"
                            shellClassName="w-32"
                            aria-label={`Individual or group for ${slot.title}`}
                            value={slot.kind}
                            onChange={(e) => {
                              /*
                                Choosing Group CLEARS the set label in the same update, rather
                                than hiding a value that is still there. A hidden field that still
                                holds "A" is the same class of bug one layer down: the screen would
                                say Group, the state would say A, and which one reached the
                                database would depend on a branch in `save`. There is one `setId`
                                column and it is either a set or null, so the editor's state is
                                kept unable to express anything else.
                              */
                              const kind: SlotKind =
                                e.target.value === "group"
                                  ? "group"
                                  : "individual";
                              patch(
                                slot.problemId,
                                kind === "group"
                                  ? { kind, setLabel: "" }
                                  : { kind },
                              );
                            }}
                          >
                            <option value="individual">Individual</option>
                            <option value="group">Group</option>
                          </Select>

                          {/*
                            The set label belongs to Individual and is shown only with it. It is
                            deliberately NOT pre-filled when the organizer switches back from
                            Group: the previous label was cleared on the way out, and putting a
                            guess back is how a row acquires a set nobody chose. Blank here is a
                            question the screen asks out loud, below, instead of an answer it
                            invents.
                          */}
                          {slot.kind === "individual" && (
                            <span className="inline-block w-20 shrink-0 align-middle">
                              <input
                                aria-label={`Set label for ${slot.title}`}
                                aria-invalid={setMissing || undefined}
                                aria-describedby={
                                  setMissing ? lineupErrorId : undefined
                                }
                                value={slot.setLabel}
                                placeholder="A"
                                onChange={(e) =>
                                  patch(slot.problemId, {
                                    setLabel: e.target.value,
                                  })
                                }
                                className={`${ROW_CONTROL} ${rowControlBorder(setMissing)}`}
                                style={{ fontSize: CONTROL_FONT_SIZE.sm }}
                              />
                            </span>
                          )}
                        </span>
                      </TD>
                      <TD align="end">
                        {/* Text, not a box: an in-row action never competes with the page's one
                            primary action (components/ui/Button.tsx). */}
                        <Button
                          type="button"
                          variant="quiet"
                          size="sm"
                          onClick={() => remove(slot.problemId)}
                        >
                          Remove
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}

        {lineupBlocked && (
          // One message for every offending input, wired by aria-describedby from each. It names
          // the duplicate because "fix something somewhere in this table" is the confusion this
          // screen is being reworked to end.
          <p
            id={lineupErrorId}
            role="alert"
            className="mt-4 font-semibold text-panther"
            style={{ fontSize: "var(--text-sm)" }}
          >
            {duplicates.length > 0 &&
              `${duplicates.length === 1 ? "Duplicate slot label" : "Duplicate slot labels"}: ${duplicates
                .map((label) => `"${label}"`)
                .join(
                  ", ",
                )}. Two problems cannot share a slot, or the board cannot order them. `}
            {blankCount > 0 &&
              `${String(blankCount)} ${blankCount === 1 ? "problem has" : "problems have"} no slot label. `}
            {setMissingCount > 0 &&
              `${String(setMissingCount)} ${
                setMissingCount === 1
                  ? "problem is marked Individual and names"
                  : "problems are marked Individual and name"
              } no set, so there is no way to say which member of a team works ${
                setMissingCount === 1 ? "it" : "them"
              }. `}
            {lineupBlockedFix}
          </p>
        )}

        {error !== null && (
          <p
            role="alert"
            className="mt-4 font-semibold text-panther"
            style={{ fontSize: "var(--text-sm)" }}
          >
            {error}
          </p>
        )}

        {/*
          Sticky, because on any contest with 5+ problems the Save row sat below the fold and
          every Add pushed it 50px lower — the dirty-flag moved to the header for exactly that
          reason and left the button behind. Negative margins run the bar to the panel's own
          edges so it reads as a bar, not a floating row; `bottom-0` pins it only while the
          panel is taller than the viewport.
        */}
        <div className="sticky bottom-0 -mx-8 -mb-8 mt-4 flex flex-wrap items-center gap-3 rounded-b-panel border-t border-rule-edge bg-paper px-8 py-4">
          <Button
            type="button"
            onClick={() => void save()}
            disabled={busy || lineupBlocked}
          >
            {busy ? "Saving…" : "Save this line-up"}
          </Button>
          {/*
            Bug (b): Add and Remove write nothing until Save, and nothing on screen said so. The
            draft state is now named the moment the list differs from what the server holds, and
            the message says what is at stake rather than just waving a flag.
          */}
          {dirty && !busy && (
            <span
              role="status"
              className="font-semibold"
              style={{ fontSize: "var(--text-sm)" }}
            >
              Not saved yet. Add, Remove and edits change only this list until
              you press Save.
            </span>
          )}
          {!dirty && saved && (
            <span
              role="status"
              className="font-semibold"
              style={{ fontSize: "var(--text-sm)" }}
            >
              Saved. Publish it from the Setup tab when the line-up is settled.
            </span>
          )}
        </div>
      </Panel>

      <Panel
        title="Problem bank"
        aside={
          // Counted against the POOL THE FILTER IS SHOWING, not against the whole bank. "6 of 130"
          // under a Ready-only filter reads as "124 problems are hidden from you" when the true
          // statement is "6 of the 9 ready ones are not already in this contest".
          <span className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
            {available.length} of{" "}
            {bankFilter === "ready" ? readyCount : bankRows.length}{" "}
            {bankFilter === "ready" ? "ready" : "in the bank"}
          </span>
        }
        description="Ready questions can be published. Draft questions may be added while you finish them."
      >
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="w-64 max-w-full">
            <TextInput
              label="Search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="title or slug"
            />
          </div>

          {/*
            Filtering by readiness, defaulting to READY.

            The bank is 130 problems of which about 121 are DRAFT and unusable in a live contest,
            and the only filter was a text box over title and slug — so finding the nine you can
            actually run required already knowing their names, among a list capped at 60 drawn
            rows. DRAFT stays one click away, because assembling next week's line-up out of
            problems still being written is a real thing to want.
          */}
          <fieldset className="flex flex-col gap-1">
            <legend
              className="mb-1 font-semibold"
              style={{ fontSize: "var(--text-sm)" }}
            >
              Show
            </legend>
            <div
              className="flex gap-4 pb-2"
              style={{ fontSize: "var(--text-sm)" }}
            >
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="bank-filter"
                  checked={bankFilter === "ready"}
                  onChange={() => setBankFilter("ready")}
                />
                Ready ({readyCount})
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="bank-filter"
                  checked={bankFilter === "all"}
                  onChange={() => setBankFilter("all")}
                />
                Everything ({bankRows.length})
              </label>
            </div>
          </fieldset>
        </div>

        {/*
          The bank's own loading and error states live HERE, inside the bank's panel, rather than
          in front of the whole component. That placement is the fix: the line-up above does not
          depend on this fetch and must never be hidden by it.
        */}
        <div className="mt-4">
          {bank.status === "loading" && (
            <PanelNote status>Loading the problem bank…</PanelNote>
          )}

          {bank.status === "error" && (
            <AlertPlate
              tone="alarm"
              title="The problem bank could not be loaded"
            >
              {bank.error ?? "Unknown error."}
            </AlertPlate>
          )}

          {bank.status === "ready" && available.length === 0 && (
            <PanelNote>
              {bankFilter === "ready"
                ? "Nothing in the bank is both ready and unused here. Switch to Everything to review questions that are still being written. Only ready questions can be added once the contest is live."
                : "No problem in the bank matches that search."}
            </PanelNote>
          )}

          {bank.status === "ready" && available.length > 0 && (
            // `relative` for the same reason as the line-up's scroller above: the sr-only "Add to
            // contest" header otherwise positions against the page and widens it at 360.
            <div className="relative min-w-0 overflow-x-auto">
              {/* The hover tint rides on the CELLS so it can never lose a specificity fight with
                  the body's zebra, which is painted on the rows. 4% ink is the header's own
                  ground; every text alpha in these cells is measured against more than that
                  (components/ui/DataTable.tsx). */}
              <Table caption="Problem bank" className="min-w-[36rem]">
                <THead>
                  <TR>
                    <TH className="w-full">Problem</TH>
                    <TH>State</TH>
                    <TH>Difficulty</TH>
                    <TH numeric>Tests</TH>
                    <TH>
                      <span className="sr-only">Add to contest</span>
                    </TH>
                  </TR>
                </THead>
                <TBody className="[&>tr:hover>td]:bg-ink/[0.04]">
                  {available.slice(0, 60).map((problem) => (
                    <TR key={problem.problemId}>
                      <TD>
                        <span className="font-semibold">{problem.title}</span>
                        {problem.readyBlockers.length > 0 && (
                          <span
                            className="mt-0.5 block text-panther"
                            style={{ fontSize: "var(--text-xs)" }}
                          >
                            {problem.readyBlockers.join("; ")}
                          </span>
                        )}
                      </TD>
                      <TD>
                        <ProblemStatePill state={problem.state} />
                      </TD>
                      <TD className="whitespace-nowrap text-ink/70">
                        {problem.difficulty ?? ""}
                      </TD>
                      <TD numeric>
                        <Stacked
                          className="items-end"
                          value={problem.testCaseCount}
                          detail={
                            <span className="whitespace-nowrap">
                              {problem.sampleCaseCount} sample
                            </span>
                          }
                        />
                      </TD>
                      <TD align="end">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => add(problem)}
                        >
                          Add
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </div>

        {available.length > 60 && (
          <p
            className="mt-3 text-ink/70"
            style={{ fontSize: "var(--text-xs)" }}
          >
            Showing the first 60 of {available.length}. Narrow your search to
            find the question you need.
          </p>
        )}
      </Panel>
    </div>
  );
}
