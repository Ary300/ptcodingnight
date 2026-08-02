"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui";
import { Panel } from "@/components/admin/Panel";
import { Select, TextInput } from "@/components/admin/Field";
import {
  API_ROUTES,
  type AddableUser,
  type AdminRoster,
  type RosterMember,
} from "@/lib/schemas/api";

/**
 * The organizer's roster: every team, every member, and everybody on no team at all.
 *
 * ## Why "add a student" is on this screen at all
 *
 * A `Participant` row belongs to exactly one contest, and until recently the only thing that ever
 * created one was a student signing in. So a contest created this morning contained nobody, and
 * this screen could not add anybody to it. The report was: "I could not add any of the people who
 * participated in the Demo to Test2 ... I could only add people if they signed up or signed in
 * AFTER the contest had started."
 *
 * The search below lists known accounts with no participant row in THIS contest and creates one.
 * It works while the contest is DRAFT or SCHEDULED, because building a roster before the start is
 * the normal case rather than an exception.
 *
 * ## Why "unassigned" is the first thing on the screen
 *
 * A participant with no team contributes to **no** team score. On the night the question an
 * organizer actually has is "who is not being counted yet", and that is a list — not something to
 * work out by comparing this screen with the leaderboard.
 *
 * ## Why every action asks for a reason, except adding
 *
 * **Team size is the divisor.** Moving one person changes TWO team scores: the team they left
 * gets a smaller divisor and the team they joined a larger one, and neither team submitted
 * anything. "Why did our score change" gets asked at 9pm, and the only acceptable answer is the
 * audit row rather than somebody's recollection. The API requires the reason; this form collects
 * it rather than letting the request fail.
 *
 * Adding somebody is the exception, and deliberately: a new participant has no team, so they are
 * in nobody's divisor and no score can move. There is nothing yet to explain.
 *
 * ## Why the two `window.prompt` dialogs are gone
 *
 * Dissolve and rename each opened one or two native prompts. `ConfirmButton`'s own docstring
 * already argues against exactly that, for exactly this screen: a native dialog cannot be styled,
 * cannot be audited by axe, and **steals focus from a room-facing screen**. It is also unbounded —
 * `prompt()` accepts a two-character reason that the API then rejects, after the dialog has
 * closed and taken the typing with it, so the organizer retypes from nothing. Rename compounded
 * it with a second prompt, which meant a cancel on the second dialog silently discarded the name
 * typed into the first.
 *
 * Both are inline forms now, in the same shape as the move form directly above them, with the
 * same disabled-until-valid rule and the same audit-log sentence.
 */

/**
 * The roster shape is the SERVER's, imported rather than restated.
 *
 * It used to be a hand-written `interface Roster` here. That is the drift `components/admin/
 * contract.ts` was already caught by — a UI type describing a server response is the server's
 * type — and it would have gone wrong again the moment the roster grew `submissionCount`, which
 * the removal form below depends on being real.
 */
type Roster = AdminRoster;
type RosterTeam = Roster["teams"][number];

function errorFrom(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = (body as { error: unknown }).error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message: unknown }).message;
      if (typeof message === "string") return message;
    }
  }
  return "Something went wrong.";
}

export interface RosterManagerProps {
  contestId: string;
}

/**
 * "The organizer has not chosen a destination yet."
 *
 * Distinct from `""`, which the submit handler maps to `teamId: null` — a real destination that
 * means REMOVE THEM FROM THEIR TEAM. Those were the same value, so the move dialog opened already
 * showing "— no team —" and doing nothing was a removal.
 */
const UNCHOSEN = "__unchosen__";

/** The API's floor for an audit reason. Stated here so the form refuses before a round trip. */
const MIN_REASON = 3;

/**
 * How long the search waits after a keystroke.
 *
 * Long enough that typing a full name is one query rather than eleven, short enough that it does
 * not feel like the box is ignoring you. The organizer is typing a name they already know.
 */
const SEARCH_DEBOUNCE_MS = 250;

/** Which team-level form is open, if any. Only ever one, so a stray Enter cannot hit the other. */
type TeamForm = { kind: "dissolve" | "rename"; teamId: string } | null;

export function RosterManager({ contestId }: RosterManagerProps) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newTeamName, setNewTeamName] = useState("");
  const [moving, setMoving] = useState<{
    participantId: string;
    displayName: string;
  } | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [reason, setReason] = useState("");
  const [settingSet, setSettingSet] = useState<RosterMember | null>(null);
  const [setTarget, setSetTarget] = useState("");
  const [assignmentReason, setAssignmentReason] = useState("");

  const [teamForm, setTeamForm] = useState<TeamForm>(null);
  const [teamFormName, setTeamFormName] = useState("");
  const [teamFormReason, setTeamFormReason] = useState("");

  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<AddableUser[] | null>(null);
  const [candidatesTruncated, setCandidatesTruncated] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [removing, setRemoving] = useState<RosterMember | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removeConfirmed, setRemoveConfirmed] = useState(false);

  const closeTeamForm = (): void => {
    setTeamForm(null);
    setTeamFormName("");
    setTeamFormReason("");
  };

  const closeRemoveForm = (): void => {
    setRemoving(null);
    setRemoveReason("");
    setRemoveConfirmed(false);
  };

  /** Only ever one form open, so a stray Enter cannot reach a different person's action. */
  const closeEveryForm = (): void => {
    setMoving(null);
    setSettingSet(null);
    setSetTarget("");
    setAssignmentReason("");
    closeTeamForm();
    closeRemoveForm();
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(API_ROUTES.adminRoster(contestId), {
          cache: "no-store",
        });
        const body: unknown = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(errorFrom(body));
          return;
        }
        setRoster((body as { data: Roster }).data);
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Could not reach the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contestId, attempt]);

  /*
    The list of people who could be added.

    Re-run on `attempt` as well as on the query, because adding somebody must take them OUT of
    this list: leaving them in produces a second click that appears to work, does nothing (the API
    is idempotent on the account), and teaches an organizer that the button is unreliable.

    `cancelled` is not just tidiness here. Typing "ale" fires three requests and they can land out
    of order, so without it the results for "al" can overwrite the results for "ale" and the list
    ends up showing people who do not match what is in the box.
  */
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            API_ROUTES.adminAddableUsers(contestId, search),
            {
              cache: "no-store",
            },
          );
          const body: unknown = await response.json();
          if (cancelled) return;
          if (!response.ok) {
            setSearchError(errorFrom(body));
            setCandidates([]);
            return;
          }
          const data = (
            body as { data: { users: AddableUser[]; truncated: boolean } }
          ).data;
          setCandidates(data.users);
          setCandidatesTruncated(data.truncated);
          setSearchError(null);
        } catch {
          if (cancelled) return;
          setSearchError("Could not reach the server.");
          setCandidates([]);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [contestId, search, attempt]);

  const send = async (
    url: string,
    method: string,
    payload: unknown,
  ): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setError(errorFrom(body));
        return;
      }
      setAttempt((n) => n + 1);
      setReason("");
      setMoveTarget("");
      setNewTeamName("");
      closeEveryForm();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  if (roster === null) {
    /*
      No heading here. The page above already has an h1 reading "Teams", and wrapping this in a
      Panel titled "Teams" printed the word twice, one line apart, with "Loading the roster…" under
      the second one — which reads as two sections where there is one.

      `role` is chosen by which it is: a failure is announced, a spinner is not.
    */
    return error === null ? (
      <p
        role="status"
        className="text-ink/70"
        style={{ fontSize: "var(--text-sm)" }}
      >
        Loading the roster…
      </p>
    ) : (
      <p
        role="alert"
        className="font-semibold text-panther"
        style={{ fontSize: "var(--text-sm)" }}
      >
        {error}
      </p>
    );
  }

  /**
   * One person on the roster, with the two things an organizer does to them.
   *
   * Shared between the unassigned list and each team's member list so the two cannot drift — the
   * remove action in particular has to carry the same submission warning wherever it appears.
   */
  const personRow = (
    person: RosterMember,
    moveVerb: "assign" | "move",
    onMove: () => void,
  ) => (
    <li key={person.participantId} className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        {/*
          `justify-start text-left` because `Button` centres its content, and a student whose
          display name is long enough to wrap — "Walkthrough Student 1785555824834" does at 360px —
          got a second line centred under the first, which reads as two separate entries rather
          than one name.
        */}
        <Button
          type="button"
          variant="quiet"
          className="justify-start text-left"
          disabled={busy}
          onClick={() => {
            closeEveryForm();
            onMove();
          }}
        >
          {/*
            "assign" for somebody on no team and "move" for somebody on one. The same word for
            both read as a no-op on the list whose whole purpose is that it should empty.

            The arrow is aria-hidden: it is a visual separator, and inside the accessible name a
            screen reader announced it as "right arrow" in the middle of the person's name (B1).
            The name is now "<person> assign", which is the action being offered.
          */}
          {person.displayName} <span aria-hidden="true">→</span> {moveVerb}
        </Button>
        {/*
          `aria-expanded:*` classes: the open state used to have no visual channel on the button
          itself, only the form appearing below (B2). Weight plus underline, never colour alone.
        */}
        <Button
          type="button"
          variant="quiet"
          className="justify-start text-left aria-expanded:font-semibold aria-expanded:text-ink aria-expanded:underline"
          aria-expanded={removing?.participantId === person.participantId}
          disabled={busy}
          onClick={() => {
            const alreadyOpen =
              removing?.participantId === person.participantId;
            closeEveryForm();
            if (!alreadyOpen) setRemoving(person);
          }}
        >
          Remove from contest
        </Button>
        {roster.problemSets.length > 0 && (
          <Button
            type="button"
            variant="quiet"
            className="justify-start text-left aria-expanded:font-semibold aria-expanded:text-ink aria-expanded:underline"
            aria-expanded={settingSet?.participantId === person.participantId}
            disabled={busy}
            onClick={() => {
              const alreadyOpen =
                settingSet?.participantId === person.participantId;
              closeEveryForm();
              if (!alreadyOpen) {
                setSettingSet(person);
                setSetTarget(person.chosenSetId ?? "");
              }
            }}
          >
            {person.chosenSetLabel === null
              ? "Choose set"
              : `Set ${person.chosenSetLabel} · change`}
          </Button>
        )}
      </div>

      {/*
        Email, when there is one. Two students really do share a name — the participant table is
        unique on (contest, display name), so the second Alex Chen is stored as "Alex Chen (2)" —
        and the organizer removing one of them needs to know which.
      */}
      {person.email !== null && (
        <span className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          {person.email}
        </span>
      )}

      {removing !== null && removing.participantId === person.participantId && (
        <form
          className="mt-tight flex flex-col gap-group border-t border-rule-hair pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (removeReason.trim().length < MIN_REASON) return;
            if (person.submissionCount > 0 && !removeConfirmed) return;
            void send(
              API_ROUTES.adminContestParticipants(contestId),
              "DELETE",
              {
                participantId: person.participantId,
                reason: removeReason.trim(),
                deleteSubmissions: removeConfirmed,
              },
            );
          }}
        >
          <p
            role="alert"
            className="font-semibold"
            style={{ fontSize: "var(--text-sm)" }}
          >
            {person.submissionCount === 0 ? (
              <>
                {person.displayName} has made no submissions, so removing them
                from this contest takes nothing else with it. They can be added
                again from the search above.
              </>
            ) : (
              <>
                {person.displayName} has{" "}
                <span className="numeric">{person.submissionCount}</span> judged
                submission
                {person.submissionCount === 1 ? "" : "s"}. Removing them from
                this contest deletes those submissions too, and the standings
                are recomputed from them, so every score they contributed to
                changes. To keep the record instead, move them to &ldquo;no
                team&rdquo;: that takes them out of every divisor and leaves
                their work in place.
              </>
            )}
          </p>

          {/*
            A grid, not a flex with a hand-tuned `mt-1` (B3). The first cell is exactly one
            line of the label's text tall (`1lh` inherits the label's line-height), and the box
            centres inside it, so the checkbox lines up with the first line of a wrapping label
            at any type scale. 18px box: the 16px default read smaller than the reference's
            (HackerRank's checkboxes measure 18-20px).
          */}
          {person.submissionCount > 0 && (
            <label
              className="grid grid-cols-[auto_1fr] items-start gap-x-2"
              style={{ fontSize: "var(--text-sm)" }}
            >
              <span className="flex h-[1lh] items-center">
                <input
                  type="checkbox"
                  className="h-[1.125rem] w-[1.125rem] accent-panther"
                  checked={removeConfirmed}
                  onChange={(event) => setRemoveConfirmed(event.target.checked)}
                />
              </span>
              <span>
                Yes, delete their {person.submissionCount} submission
                {person.submissionCount === 1 ? "" : "s"} as well. This cannot
                be undone.
              </span>
            </label>
          )}

          <TextInput
            label="Reason"
            required
            value={removeReason}
            placeholder="Why this person is being removed"
            hint="Goes in the audit log, along with how many submissions went with them."
            onChange={(event) => setRemoveReason(event.target.value)}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="danger"
              disabled={
                busy ||
                removeReason.trim().length < MIN_REASON ||
                (person.submissionCount > 0 && !removeConfirmed)
              }
            >
              {busy ? "Removing…" : "Remove from contest"}
            </Button>
            <Button
              type="button"
              variant="quiet"
              onClick={closeRemoveForm}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </li>
  );

  return (
    <div className="flex min-w-0 flex-col gap-section">
      <Panel
        title="Add a student"
        level="framed"
        description={
          <>
            Anybody with an account can be put on this contest, whether or not
            they have signed into it. That includes everyone from previous
            contests. Adding somebody creates their place in this contest with
            no team, so no score moves.
          </>
        }
      >
        <div className="flex flex-col gap-group">
          <TextInput
            label="Search by name or email"
            type="search"
            value={search}
            placeholder="Start typing a name"
            hint="Only accounts that are not already in this contest are listed."
            onChange={(event) => setSearch(event.target.value)}
          />

          {searchError !== null && (
            <p
              role="alert"
              className="font-semibold text-panther"
              style={{ fontSize: "var(--text-sm)" }}
            >
              {searchError}
            </p>
          )}

          {candidates === null ? (
            <p
              role="status"
              className="text-ink/70"
              style={{ fontSize: "var(--text-sm)" }}
            >
              Loading accounts…
            </p>
          ) : candidates.length === 0 ? (
            <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
              {search.trim() === ""
                ? "Everybody with an account is already in this contest."
                : "No account outside this contest matches that."}
            </p>
          ) : (
            <ul className="flex flex-col gap-tight">
              {candidates.map((candidate) => (
                <li
                  key={candidate.userId}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule-hair pb-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span
                      className="font-semibold"
                      style={{ fontSize: "var(--text-sm)" }}
                    >
                      {candidate.displayName}
                      {candidate.role === "ADMIN" && (
                        // Said in words, never by colour alone. An organizer added as a competitor
                        // lands in a team's divisor, which is a scoring change, so the screen has
                        // to say which kind of account this is before the click.
                        <span
                          className="ml-2 font-normal text-ink/70"
                          style={{ fontSize: "var(--text-xs)" }}
                        >
                          (organizer account)
                        </span>
                      )}
                    </span>
                    {/*
                      Enough to tell two students apart, which is the whole job of this list. A
                      name alone is not enough: the participant table has to invent a "(2)" suffix
                      precisely because two people share one.
                    */}
                    <span
                      className="text-ink/60"
                      style={{ fontSize: "var(--text-xs)" }}
                    >
                      {[
                        candidate.email,
                        candidate.gradYear === null
                          ? null
                          : `class of ${String(candidate.gradYear)}`,
                        candidate.pastContests.length === 0
                          ? "no previous contests"
                          : `was in ${candidate.pastContests.slice(0, 2).join(", ")}`,
                      ]
                        .filter((part) => part !== null)
                        .join(" · ")}
                    </span>
                  </div>
                  {/*
                    Quiet, not secondary (B8): both references keep in-row actions as text, and
                    an outlined box on every candidate row competed with the page's own actions.
                    The label stays exactly "Add": tests/e2e/organizer-setup-flow.spec.ts finds
                    this button by that name with exact matching.
                  */}
                  <Button
                    type="button"
                    variant="quiet"
                    disabled={busy}
                    onClick={() => {
                      void send(
                        API_ROUTES.adminContestParticipants(contestId),
                        "POST",
                        {
                          userId: candidate.userId,
                        },
                      );
                    }}
                  >
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {candidatesTruncated && (
            <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              More accounts match than are shown. Type more of the name to
              narrow it down.
            </p>
          )}
        </div>
      </Panel>

      <Panel
        title="Not on a team"
        level="bare"
        aside={
          <span
            className="numeric text-ink/60"
            style={{ fontSize: "var(--text-sm)" }}
          >
            {roster.unassigned.length}
          </span>
        }
        description={
          <>
            {/*
              The emphasis wraps the whole claim rather than the single word "no". As
              `<strong>no</strong> team score` it rendered as "noteam score" at 360px — the space
              between an inline element's close tag and the next word is real in the source and
              easy to lose to a formatter, and a missing space inside a sentence about scoring is
              not a thing to leave to chance.
            */}
            These participants contribute to <strong>no team score</strong>, and
            their points are in nobody&rsquo;s pool. Assign everyone before the
            contest begins.
          </>
        }
      >
        {roster.unassigned.length === 0 ? (
          <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            Everyone is on a team.
          </p>
        ) : (
          <ul className="flex flex-col gap-tight">
            {roster.unassigned.map((person) =>
              personRow(person, "assign", () => {
                setMoving(person);
                // Unassigned already: the sentinel below forces a deliberate choice rather
                // than letting the form submit the state they are already in.
                setMoveTarget(UNCHOSEN);
              }),
            )}
          </ul>
        )}
      </Panel>

      {moving !== null && (
        <Panel title={`Move ${moving.displayName}`} level="framed">
          <form
            className="flex flex-col gap-group"
            onSubmit={(event) => {
              event.preventDefault();
              // Refused rather than guessed. `UNCHOSEN` means the organizer never touched the
              // dropdown, and the one thing this form must not do is pick for them.
              if (moveTarget === UNCHOSEN) return;
              void send(API_ROUTES.adminMoveParticipant(contestId), "POST", {
                participantId: moving.participantId,
                teamId: moveTarget === "" ? null : moveTarget,
                reason,
              });
            }}
          >
            <Select
              label="Team"
              required
              value={moveTarget}
              onChange={(event) => setMoveTarget(event.target.value)}
            >
              {/*
                A sentinel that is not a valid destination, so "I did not choose" and "remove
                them from their team" are different answers. They used to be the same value.
              */}
              <option value={UNCHOSEN} disabled>
                Choose a team…
              </option>
              {/* Brackets rather than dashes: no em dash may appear in text a user reads. */}
              <option value="">(remove from their team)</option>
              {roster.teams.map((team: RosterTeam) => (
                <option key={team.teamId} value={team.teamId}>
                  {team.name} ({team.memberCount} {team.memberCount === 1 ? "member" : "members"})
                </option>
              ))}
            </Select>

            <TextInput
              label="Reason"
              required
              value={reason}
              placeholder="Why this is being changed"
              hint="This moves two divisors at once, so it changes two team scores. The reason goes in the audit log."
              onChange={(event) => setReason(event.target.value)}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={busy || reason.trim().length < MIN_REASON}
              >
                {busy ? "Moving…" : "Move"}
              </Button>
              <Button
                type="button"
                variant="quiet"
                onClick={() => setMoving(null)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      )}

      {settingSet !== null && (
        <Panel
          title={`Problem set for ${settingSet.displayName}`}
          level="framed"
        >
          <form
            className="flex flex-col gap-group"
            onSubmit={(event) => {
              event.preventDefault();
              if (assignmentReason.trim().length < MIN_REASON) return;
              void send(API_ROUTES.adminReassignSet(contestId), "POST", {
                participantId: settingSet.participantId,
                setId: setTarget === "" ? null : setTarget,
                reason: assignmentReason.trim(),
              });
            }}
          >
            <Select
              label="Problem set"
              value={setTarget}
              onChange={(event) => setSetTarget(event.target.value)}
            >
              <option value="">(no individual set)</option>
              {roster.problemSets.map((set) => (
                <option key={set.setId} value={set.setId}>
                  Set {set.label}
                </option>
              ))}
            </Select>

            <p className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
              {roster.setSelection === "RANDOM_ASSIGNED"
                ? "Teammates must hold different sets. A conflicting choice will be refused."
                : roster.setSelection === "ONE_SET_PER_TEAM"
                  ? "Every member of one team should hold the same set."
                  : "Players choose independently in this contest format."}
            </p>

            <TextInput
              label="Reason"
              required
              value={assignmentReason}
              placeholder="Why this assignment is being changed"
              hint="This can change which questions the student may open, so it is recorded in the audit log."
              onChange={(event) => setAssignmentReason(event.target.value)}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={busy || assignmentReason.trim().length < MIN_REASON}
              >
                {busy ? "Saving…" : "Save set"}
              </Button>
              <Button
                type="button"
                variant="quiet"
                onClick={() => setSettingSet(null)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      )}

      <Panel
        title="Teams"
        level="bare"
        aside={
          <span
            className="numeric text-ink/60"
            style={{ fontSize: "var(--text-sm)" }}
          >
            {roster.teams.length} · max {roster.maxTeamSize}
          </span>
        }
      >
        <form
          className="mb-group flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send(API_ROUTES.adminTeams(contestId), "POST", {
              name: newTeamName,
            });
          }}
        >
          <div className="w-64">
            <TextInput
              label="New team name"
              value={newTeamName}
              onChange={(event) => setNewTeamName(event.target.value)}
            />
          </div>
          {/*
            Primary, not secondary (B11): creating a team is the one creating action on this
            panel, and the reference fills its creating action ("Create a Contest" is solid).
          */}
          <Button type="submit" disabled={busy || newTeamName.trim() === ""}>
            Create team
          </Button>
        </form>

        {roster.teams.length === 0 ? (
          <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            No teams yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-group">
            {roster.teams.map((team: RosterTeam) => (
              <li
                key={team.teamId}
                className="rounded-panel border border-rule-edge p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span
                    className="font-semibold"
                    style={{ fontSize: "var(--text-sm)" }}
                  >
                    {team.name}
                  </span>
                  {/*
                    The team's join code used to sit here. Nothing can be done with it — students
                    sign in with a provider and an organizer builds the roster — so it was a string
                    that looked actionable and was not, on the screen where a wrong action changes
                    two team scores. The size is what matters here: it IS the divisor.
                  */}
                  <span
                    className="numeric text-ink/60"
                    style={{ fontSize: "var(--text-xs)" }}
                  >
                    {team.memberCount}/{team.maxTeamSize} · divisor{" "}
                    {team.memberCount}
                  </span>
                </div>

                <ul className="mt-tight flex flex-col gap-tight">
                  {team.members.map((member: RosterMember) =>
                    personRow(member, "move", () => {
                      /*
                        DEFAULT TO THE TEAM THEY ARE ALREADY ON.

                        This used to set "", which the submit handler maps to `teamId: null` — so
                        the dialog opened showing "— no team —" and an organizer who typed a reason
                        and pressed Move without touching the dropdown REMOVED the player from
                        their team. Team size is the divisor in every team score, so the accidental
                        path was a silent score change for two teams.

                        A destructive action must never be the one that happens when you do
                        nothing.
                      */
                      setMoving(member);
                      setMoveTarget(team.teamId);
                    }),
                  )}
                  {team.members.length === 0 && (
                    <li
                      className="text-ink/60"
                      style={{ fontSize: "var(--text-xs)" }}
                    >
                      No members, so this team scores nothing.
                    </li>
                  )}
                </ul>

                {/*
                  As on the remove toggle above: `aria-expanded:*` gives the open toggle a
                  visual channel of its own (B12) - weight and underline, never colour alone.
                */}
                <div className="mt-tight flex flex-wrap gap-x-4">
                  <Button
                    type="button"
                    variant="quiet"
                    className="aria-expanded:font-semibold aria-expanded:text-ink aria-expanded:underline"
                    aria-expanded={
                      teamForm?.kind === "rename" &&
                      teamForm.teamId === team.teamId
                    }
                    disabled={busy}
                    onClick={() => {
                      const alreadyOpen =
                        teamForm?.kind === "rename" &&
                        teamForm.teamId === team.teamId;
                      closeEveryForm();
                      setTeamFormName(team.name);
                      if (!alreadyOpen)
                        setTeamForm({ kind: "rename", teamId: team.teamId });
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    className="aria-expanded:font-semibold aria-expanded:text-ink aria-expanded:underline"
                    aria-expanded={
                      teamForm?.kind === "dissolve" &&
                      teamForm.teamId === team.teamId
                    }
                    disabled={busy}
                    onClick={() => {
                      const alreadyOpen =
                        teamForm?.kind === "dissolve" &&
                        teamForm.teamId === team.teamId;
                      closeEveryForm();
                      if (!alreadyOpen)
                        setTeamForm({ kind: "dissolve", teamId: team.teamId });
                    }}
                  >
                    Dissolve
                  </Button>
                </div>

                {teamForm !== null && teamForm.teamId === team.teamId && (
                  <form
                    className="mt-group flex flex-col gap-group border-t border-rule-hair pt-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (teamFormReason.trim().length < MIN_REASON) return;
                      if (teamForm.kind === "rename") {
                        if (teamFormName.trim() === "") return;
                        void send(API_ROUTES.adminTeam(team.teamId), "PATCH", {
                          name: teamFormName.trim(),
                          reason: teamFormReason.trim(),
                        });
                      } else {
                        void send(API_ROUTES.adminTeam(team.teamId), "DELETE", {
                          reason: teamFormReason.trim(),
                        });
                      }
                    }}
                  >
                    {teamForm.kind === "rename" ? (
                      <TextInput
                        label={`New name for ${team.name}`}
                        required
                        value={teamFormName}
                        onChange={(event) =>
                          setTeamFormName(event.target.value)
                        }
                      />
                    ) : (
                      <p
                        role="alert"
                        className="font-semibold"
                        style={{ fontSize: "var(--text-sm)" }}
                      >
                        Dissolving &ldquo;{team.name}&rdquo; makes its{" "}
                        {team.memberCount} member
                        {team.memberCount === 1 ? "" : "s"} teamless. Their
                        points then count for nobody until they are reassigned.
                      </p>
                    )}

                    <TextInput
                      label="Reason"
                      required
                      value={teamFormReason}
                      placeholder="Why this is being changed"
                      hint="Recorded in the audit log because roster changes can affect scores."
                      onChange={(event) =>
                        setTeamFormReason(event.target.value)
                      }
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="submit"
                        variant={
                          teamForm.kind === "dissolve" ? "danger" : "secondary"
                        }
                        disabled={
                          busy ||
                          teamFormReason.trim().length < MIN_REASON ||
                          (teamForm.kind === "rename" &&
                            teamFormName.trim() === "")
                        }
                      >
                        {teamForm.kind === "rename"
                          ? "Rename team"
                          : "Dissolve team"}
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        onClick={closeTeamForm}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {error !== null && (
          <p
            role="alert"
            className="mt-group font-semibold text-panther"
            style={{ fontSize: "var(--text-sm)" }}
          >
            {error}
          </p>
        )}
      </Panel>
    </div>
  );
}
