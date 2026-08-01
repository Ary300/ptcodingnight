"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Panel, AlertPlate } from "@/components/admin/Panel";
import { TextInput } from "@/components/admin/Field";
import { Button, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import {
  API_ROUTES,
  type SetCompositionInput,
  type SetPlanResponse,
  type StoredSetPlanResponse,
} from "@/lib/schemas/api";

/**
 * Building the contest's question sets: the organizer's side of `lib/contest/set-plan.ts`.
 *
 * This is the screen the organizer asked for in as many words: "a thing there where we can select
 * how many questions each team will get so then it knows how to split it".
 *
 * ## The format, in the organizer's own layout
 *
 * Their sheet has the sets as COLUMNS and the teams as ROWS:
 *
 *     Questions │  A    │  B       │  C     │  D
 *     Group 1   │ John  │ Peter    │ Paul   │ Simon
 *     Group 2   │ Mark  │ Anthony  │ David  │ Bryan
 *
 * So the preview below is a column per set, because that is how it was written and therefore how
 * it will be read back. Four sets under a one-of-each recipe is TWELVE distinct problems, not
 * three: no problem may appear in two columns, or two members of a team would be working the same
 * question and could simply tell each other the answer.
 *
 * ## Nothing here decides anything
 *
 * Every number on this screen comes from the server. The split comes from `planSets`, the refusal
 * when the bank cannot fill a recipe comes back as a sentence carrying its own arithmetic ("4 Hard
 * problems are needed for 4 sets and the bank has 2, so 2 more Hard problems are required"), and
 * the points on each card are the `basePoints` the row will actually be written with. The one
 * piece of arithmetic in this file is `setSize`, which is the sum of three numbers the organizer
 * just typed and is a restatement of their own input rather than a second opinion about the bank.
 *
 * That is deliberate. A screen that recomputes a shortfall locally is a screen that can disagree
 * with the route it is about to call, and the organizer has no way to tell which half is lying.
 *
 * ## The seed is carried, not hidden
 *
 * A preview mints a seed and the apply is given it back. Same recipe, same bank and same seed is
 * the same deal, byte for byte; drop the seed and the apply mints a fresh one and writes a
 * different, equally valid split from the one that was on screen. That is the single way this
 * screen could lie to an organizer, so the seed is shown, echoed, and stored with the contest:
 * a disputed set has to be re-derivable in front of the student disputing it (PRD 6.2).
 *
 * On arrival the preview is seeded from the STORED seed, so "deal again" is the only thing that
 * can change the split. An organizer who opens this tab, changes nothing and presses Build gets
 * back what they already had.
 *
 * ## Group problems are not here, and that is worth one sentence
 *
 * A GROUP problem belongs to no set: the whole team works it and every team gets the same ones.
 * They are neither dealt nor deleted by this screen, which is why the count of them is shown
 * beside the split. An organizer who comes here looking for them is pointed at the Problems tab,
 * where a question is designated Group or Individual.
 */

type Difficulty = "E" | "M" | "H";

/*
 * Not imported from `lib/contest/set-plan.ts`, which owns the canonical copy: that module imports
 * `node:crypto` for its seeded shuffle, and a client component that pulls it in fails to bundle.
 * Three words restated is the cheaper cost, and the same call `ProblemMeta`, `ProblemList` and
 * `ProblemBuilder` each already made.
 */
const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = {
  E: "Easy",
  M: "Medium",
  H: "Hard",
};

const DIFFICULTIES: readonly Difficulty[] = ["E", "M", "H"];

/** The recipe previous years ran: one of each. Every count is editable and may be zero. */
const DEFAULT_COUNTS: Readonly<Record<Difficulty, string>> = { E: "1", M: "1", H: "1" };

/**
 * How many sets to offer when the roster cannot answer.
 *
 * The real default is the size of the largest team, because that is the number that lets every
 * member of a team hold a different column. This is only the fallback for a contest whose roster
 * is still empty, and the hint says which of the two the organizer is looking at.
 */
const FALLBACK_SET_COUNT = 4;

/** The route's own ceiling: A to Z. Restated so the form refuses before a round trip. */
const MAX_SETS = 26;

/** The route's own ceiling for one recipe line. */
const MAX_PER_LINE = 20;

/** Long enough that typing "12" is one preview rather than two. */
const PREVIEW_DEBOUNCE_MS = 300;

/** Contest states in which the sets may still be rebuilt. The server enforces this too. */
const REBUILDABLE: readonly string[] = ["DRAFT", "SCHEDULED"];

export interface SetPlannerTeam {
  readonly teamId: string;
  readonly name: string;
  /**
   * Derived from the roster on every read, never a stored count: a stored size is a second source
   * of truth that drifts from the thing it describes. Here it decides how many columns are needed,
   * which makes a wrong size a wrong contest rather than a wrong label.
   */
  readonly size: number;
}

export interface SetPlannerProps {
  readonly contestId: string;
  readonly teams: readonly SetPlannerTeam[];
}

function errorFrom(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = (body as { error: unknown }).error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message: unknown }).message;
      if (typeof message === "string" && message.length > 0) return message;
    }
  }
  return "Something went wrong.";
}

/** A whole number, or null when the box does not hold one. Blank is null, not zero. */
function parseWhole(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

function setCountError(text: string): string | null {
  const value = parseWhole(text);
  if (value === null) return "Type a whole number of sets.";
  if (value < 1) return "Build at least one set.";
  if (value > MAX_SETS) return `${String(MAX_SETS)} sets is A to Z, which is as far as this goes.`;
  return null;
}

/**
 * Whether two recipes ask for the same thing. `points` is deliberately not compared: this screen
 * never sends one, so the only difference two recipes can have here is a difficulty or a count.
 */
function sameComposition(a: SetCompositionInput, b: SetCompositionInput): boolean {
  if (a.length !== b.length) return false;
  return a.every((line, index) => {
    const other = b[index];
    return other !== undefined && other.difficulty === line.difficulty && other.count === line.count;
  });
}

function perLineError(text: string): string | null {
  const value = parseWhole(text);
  if (value === null) return "Type a whole number, or 0 for none.";
  if (value > MAX_PER_LINE) return `${String(MAX_PER_LINE)} is the most one line may ask for.`;
  return null;
}

// ---------------------------------------------------------------------------
// The grid: a column per set, as on the organizer's sheet
// ---------------------------------------------------------------------------

interface GridProblem {
  readonly title: string;
  readonly slotLabel: string;
  readonly basePoints: number;
  readonly difficulty: Difficulty | null;
}

interface GridSet {
  readonly label: string;
  readonly problems: readonly GridProblem[];
}

/**
 * The row headings, read off the first column rather than off the recipe. Deriving them from the
 * composition would be a second description of the same table, free to disagree with the cells
 * beside it the moment the engine's ordering changed. Every set holds the same recipe in the same
 * order, so the first one names the rows of all of them.
 */
function rowHeadings(sets: readonly GridSet[]): readonly string[] {
  const first = sets[0];
  if (first === undefined) return [];

  const seen = new Map<string, number>();
  return first.problems.map((problem) => {
    const key = problem.difficulty ?? "?";
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const label = problem.difficulty === null ? "Unrated" : DIFFICULTY_LABEL[problem.difficulty];
    return `${label} ${String(n)}`;
  });
}

function SetGrid({ sets, caption }: { readonly sets: readonly GridSet[]; readonly caption: string }) {
  const headings = rowHeadings(sets);

  if (sets.length === 0 || headings.length === 0) {
    return (
      <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        There is nothing to show yet.
      </p>
    );
  }

  return (
    // The table has one column per set and a contest may run six of them, so it scrolls inside
    // its own box. `min-w-0` because this is a flex child: without it the whole page drags
    // sideways and the box's own overflow does nothing.
    <div className="min-w-0 overflow-x-auto">
      <Table caption={caption} className="min-w-[44rem]">
        <THead>
          <TR>
            <TH scope="col">Questions</TH>
            {sets.map((set) => (
              <TH key={set.label} scope="col">
                Set {set.label}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {headings.map((heading, row) => (
            <TR key={heading}>
              <TH scope="row" className="whitespace-nowrap font-semibold">
                {heading}
              </TH>
              {sets.map((set) => {
                const problem = set.problems[row];
                return (
                  <TD key={set.label}>
                    {problem === undefined ? (
                      <span className="text-ink/60">Nothing dealt</span>
                    ) : (
                      <>
                        <span className="font-semibold">{problem.title}</span>
                        <span
                          className="numeric mt-tight block text-ink/60"
                          style={{ fontSize: "var(--text-xs)" }}
                        >
                          {problem.slotLabel} · {String(problem.basePoints)} points
                        </span>
                      </>
                    )}
                  </TD>
                );
              })}
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function SetPlanner({ contestId, teams }: SetPlannerProps) {
  const largestTeam = teams.reduce<SetPlannerTeam | null>(
    (largest, team) => (largest === null || team.size > largest.size ? team : largest),
    null,
  );
  const rosterDefault = largestTeam !== null && largestTeam.size > 0 ? largestTeam.size : null;

  const [stored, setStored] = useState<StoredSetPlanResponse | null>(null);
  const [storedError, setStoredError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [setCountText, setSetCountText] = useState(
    String(rosterDefault ?? FALLBACK_SET_COUNT),
  );
  const [counts, setCounts] = useState<Record<Difficulty, string>>({ ...DEFAULT_COUNTS });
  /**
   * The set count this contest was last BUILT with, once the stored plan has been adopted.
   *
   * Kept separately from the box because the hint under it has to say which of the two numbers the
   * organizer is looking at. A box reading 3 under a hint that says "starts at 2" is a screen
   * arguing with itself, and the organizer has no way to tell which half is stale.
   */
  const [adoptedCount, setAdoptedCount] = useState<number | null>(null);

  const [preview, setPreview] = useState<SetPlanResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  /**
   * Whether the organizer has changed anything since the tab opened. It decides which of two true
   * things the grid shows: the sets AS THEY STAND, read out of the database, or the split being
   * proposed. Showing a proposal under the heading "the sets" is how an organizer walks away
   * believing they built something they did not.
   */
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  /**
   * The seed the next preview asks for, held in a ref rather than in state. It is written BY the
   * preview effect (from the response) and read by it, so putting it in the dependency list would
   * re-run the effect on its own result forever, and leaving it out is the kind of lie the
   * exhaustive-deps rule exists to catch. A ref is the honest form: this is an input to the
   * request, not something the screen renders. What the screen renders is `preview.seed`, which is
   * what the server actually dealt from.
   *
   * Null means "mint a fresh one", which is exactly what dealing again asks for.
   */
  const seedRef = useRef<string | null>(null);
  const [reroll, setReroll] = useState(0);

  const composition: SetCompositionInput = useMemo(() => {
    const lines = DIFFICULTIES.map((difficulty) => ({
      difficulty,
      count: parseWhole(counts[difficulty]) ?? 0,
    }));
    const active = lines.filter((line) => line.count > 0);
    // An all-zero recipe is still sent in full: the array has to hold at least one line to pass
    // the route's schema, and the answer an organizer needs there is the engine's ("The set is
    // empty. Say how many problems of each difficulty a set should hold.") rather than a 400.
    return active.length > 0 ? active : lines;
  }, [counts]);

  const countErrors: Record<Difficulty, string | null> = {
    E: perLineError(counts.E),
    M: perLineError(counts.M),
    H: perLineError(counts.H),
  };
  const setsError = setCountError(setCountText);
  const formValid =
    setsError === null && DIFFICULTIES.every((difficulty) => countErrors[difficulty] === null);

  const setCount = parseWhole(setCountText) ?? 0;
  const perSet = composition.reduce((total, line) => total + line.count, 0);

  /** Teams with more members than there are columns. Somebody on each of them repeats a set. */
  const crowdedTeams = teams.filter((team) => setsError === null && team.size > setCount);

  const contestState = stored?.contestState ?? null;
  const rebuildable = contestState === null || REBUILDABLE.includes(contestState);

  /* Read what is already built. Also the only source of `contestState` and `groupProblemCount`. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(API_ROUTES.adminContestSets(contestId), {
          cache: "no-store",
        });
        const body: unknown = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setStoredError(errorFrom(body));
          setLoaded(true);
          return;
        }
        const data = (body as { data: StoredSetPlanResponse }).data;
        setStored(data);
        setStoredError(null);

        /*
          Adopt the stored plan as the form's starting point, here rather than in an effect of its
          own that watches `stored`.

          A contest that has already been planned opens showing ITS recipe and ITS seed, not the
          roster default and a fresh deal. That is what makes the first preview reproduce the split
          actually in the database, so an organizer who opens this tab and presses Build gets back
          exactly what they had rather than a re-shuffle they did not ask for. It runs again after
          an apply, because `attempt` re-reads: that is how the form stops being dirty once its
          proposal has become the truth.
        */
        if (data.setCount !== null && data.setCount > 0) {
          setSetCountText(String(data.setCount));
          setAdoptedCount(data.setCount);
        }
        if (data.composition !== null) {
          const adopted: Record<Difficulty, string> = { E: "0", M: "0", H: "0" };
          for (const line of data.composition) adopted[line.difficulty] = String(line.count);
          setCounts(adopted);
        }
        seedRef.current = data.seed;
        setDirty(false);
        setLoaded(true);
      } catch {
        if (cancelled) return;
        setStoredError("Could not reach the server.");
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contestId, attempt]);

  /*
    Feasibility, before anything is built. This runs on every edit rather than behind a "check"
    button, because the useful moment to say "the bank has two Hard problems and this needs four"
    is while the organizer is still choosing the number, not after they have committed to it.
    Debounced so holding a key down is one request rather than eight.
  */
  useEffect(() => {
    if (!loaded || !formValid) return;
    let cancelled = false;

    const timer = setTimeout(() => {
      setPreviewing(true);
      void (async () => {
        try {
          const seed = seedRef.current;
          const response = await fetch(API_ROUTES.adminContestSets(contestId), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              mode: "preview",
              composition,
              setCount,
              ...(seed === null ? {} : { seed }),
            }),
          });
          const body: unknown = await response.json();
          if (cancelled) return;
          if (!response.ok) {
            setPreviewError(errorFrom(body));
            setPreview(null);
            return;
          }
          const data = (body as { data: SetPlanResponse }).data;
          // Hold on to the seed the server dealt from, so the apply that follows reproduces this
          // exact split. A refusal deals nothing and returns null, and the next preview mints one.
          seedRef.current = data.seed;
          setPreview(data);
          setPreviewError(null);
        } catch {
          if (cancelled) return;
          setPreviewError("Could not reach the server.");
          setPreview(null);
        } finally {
          if (!cancelled) setPreviewing(false);
        }
      })();
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [contestId, composition, setCount, formValid, loaded, reroll]);

  const storedSets = stored?.sets ?? [];
  const showStored = !dirty && storedSets.length > 0;
  const plannedSets = preview !== null && preview.plan.ok ? preview.plan.sets : [];

  /**
   * Whether the split on screen is a split of what is in the boxes RIGHT NOW. The preview is
   * debounced, so for a few hundred milliseconds after a keystroke the grid describes the previous
   * recipe: fine to look at, not fine to build, since Build sends the previewed plan and an
   * organizer could otherwise type a 5, press it inside the debounce window, and get four sets.
   * The grid is left up rather than blanked, because a table that vanishes on every keystroke is
   * unreadable; it is BUILD that waits.
   */
  const previewMatches =
    preview !== null &&
    formValid &&
    preview.setCount === setCount &&
    sameComposition(preview.composition, composition);
  const buildable = previewMatches && preview.plan.ok && rebuildable;

  /*
    Why the box says what it says. Three genuinely different facts: the contest has been built
    before and the box holds THAT number; it has not, and the box holds the roster's answer; or
    there is no roster yet and the box holds a guess. The recommendation is repeated in the first
    case rather than dropped, because the reason an organizer opens this screen a second time is
    usually that the roster has changed underneath the plan.
  */
  const why =
    "Every member of a team holds a different set, so one set per member of your largest team is what stops anybody repeating one.";
  const teamName = largestTeam?.name ?? "";
  const setCountHint =
    adoptedCount !== null
      ? rosterDefault === null
        ? `This contest was last built with ${String(adoptedCount)} sets, and nobody is on a team yet. ${why}`
        : `This contest was last built with ${String(adoptedCount)} sets, and your largest team (${teamName}) has ${String(rosterDefault)}. ${why}`
      : rosterDefault === null
        ? `There is nobody on a team yet, so this starts at ${String(FALLBACK_SET_COUNT)}. ${why}`
        : `Starts at ${String(rosterDefault)}, the size of your largest team (${teamName}). ${why}`;

  const edited = (): void => {
    setDirty(true);
    setConfirming(false);
    setApplied(null);
    setApplyError(null);
  };

  const dealAgain = (): void => {
    seedRef.current = null;
    edited();
    setReroll((n) => n + 1);
  };

  const apply = async (): Promise<void> => {
    // Re-checked here and not only on the button, because the confirmation step puts a second
    // click between the check and the write.
    if (preview === null || !preview.plan.ok || !buildable) return;
    setApplying(true);
    setApplyError(null);
    try {
      const response = await fetch(API_ROUTES.adminContestSets(contestId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "apply",
          composition: preview.composition,
          setCount: preview.setCount,
          // The seed of the deal ON SCREEN, never a fresh one. This is the whole reason the
          // preview hands its seed back.
          ...(preview.seed === null ? {} : { seed: preview.seed }),
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setApplyError(errorFrom(body));
        return;
      }
      const data = (body as { data: SetPlanResponse }).data;
      if (!data.applied) {
        setApplyError(
          data.plan.ok ? "Nothing was written." : data.plan.message,
        );
        return;
      }
      setConfirming(false);
      setApplied(
        `Built ${String(data.setCount)} sets of ${String(data.setSize)} questions each. ` +
          `Seed ${data.seed ?? "unknown"}.`,
      );
      setAttempt((n) => n + 1);
    } catch {
      setApplyError("Could not reach the server.");
    } finally {
      setApplying(false);
    }
  };

  /** The seed behind the grid actually on screen, which is the only one worth naming. */
  const shownSeed = showStored ? (stored?.seed ?? null) : (preview?.seed ?? null);

  return (
    <div className="flex flex-col gap-8">
      {storedError !== null && (
        <AlertPlate tone="alarm" title="The current split could not be read" live={false}>
          {/* The server's own sentence gets its own paragraph. Running it into ours produced
              "Something went wrong on our end You can still plan…", because a message from an
              error envelope carries no trailing full stop and is not ours to punctuate. */}
          <p>{storedError}</p>
          <p className="mt-tight">
            You can still plan and build sets below, and the server refuses anything it would not
            allow, but this screen cannot show you what is there now.
          </p>
        </AlertPlate>
      )}

      {!rebuildable && (
        <AlertPlate tone="notice" title="This contest has started, so its sets are fixed" live={false}>
          Rebuilding the split now would move students off questions they have already started
          working on, and their submissions would point at slots that no longer exist. The plan
          below can be read and previewed, and Build stays refused until the contest ends.
        </AlertPlate>
      )}

      <Panel
        title="How many sets"
        description="One column per member of your largest team, so that nobody on a team is handed a set a teammate already has."
      >
        <div className="flex flex-col gap-group">
          <TextInput
            label="Number of sets"
            numeric
            inputMode="numeric"
            value={setCountText}
            error={setsError}
            onChange={(event) => {
              setSetCountText(event.target.value);
              edited();
            }}
            hint={setCountHint}
          />

          {crowdedTeams.length > 0 && (
            <p className="max-w-[70ch] font-semibold text-panther" style={{ fontSize: "var(--text-xs)" }}>
              Warning: {crowdedTeams.map((team) => `${team.name} (${String(team.size)})`).join(", ")}{" "}
              {crowdedTeams.length === 1 ? "has" : "have"} more members than there are sets, so
              somebody on {crowdedTeams.length === 1 ? "that team" : "those teams"} will be handed a
              set a teammate is already working.
            </p>
          )}
        </div>
      </Panel>

      <Panel
        title="What is in a set"
        description="One Easy, one Medium and one Hard is what previous years ran. Any count may be zero. What a question is worth follows its difficulty and is shown on every card below; change an individual slot on the Problems tab."
      >
        <div className="flex flex-col gap-group">
          {DIFFICULTIES.map((difficulty) => (
            <TextInput
              key={difficulty}
              label={`${DIFFICULTY_LABEL[difficulty]} per set`}
              numeric
              inputMode="numeric"
              value={counts[difficulty]}
              error={countErrors[difficulty]}
              onChange={(event) => {
                const value = event.target.value;
                setCounts((current) => ({ ...current, [difficulty]: value }));
                edited();
              }}
            />
          ))}

          <p className="max-w-[70ch]" style={{ fontSize: "var(--text-sm)" }}>
            {formValid ? (
              <>
                <strong>
                  {String(perSet)} {perSet === 1 ? "question" : "questions"} per set,{" "}
                  {String(setCount)} {setCount === 1 ? "set" : "sets"},{" "}
                  {String(perSet * setCount)} distinct{" "}
                  {perSet * setCount === 1 ? "question" : "questions"} needed.
                </strong>{" "}
                No question appears in two sets, which is why the total multiplies.
                {stored !== null && (
                  <>
                    {" "}
                    The bank has {String(stored.poolSize)} to draw on.
                  </>
                )}
              </>
            ) : (
              "Fix the numbers above to see what this adds up to."
            )}
          </p>
        </div>
      </Panel>

      {preview !== null && !preview.plan.ok && (
        // The engine's sentence, verbatim. It already carries the arithmetic, and a second
        // wording here would be a second answer free to disagree with the route.
        <AlertPlate tone="alarm" title="These sets cannot be built yet">
          <p>{preview.plan.message}</p>
          <p className="mt-tight">
            Publish more questions in the bank, or ask for fewer of that difficulty in each set.
          </p>
        </AlertPlate>
      )}

      {previewError !== null && (
        <AlertPlate tone="alarm" title="The split could not be worked out">
          {previewError}
        </AlertPlate>
      )}

      <Panel
        title={showStored ? "The sets as they stand" : "The proposed split"}
        description={
          showStored
            ? "This is what is in the database now, and what the students will see. Change a number above, or deal again, to plan a different one."
            : "Nothing here is saved until you press Build. Every column is one set, exactly as on the sheet."
        }
        aside={
          previewing || (formValid && !previewMatches) ? (
            <span className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              Working it out…
            </span>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-group">
          {!loaded ? (
            <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
              Reading the contest…
            </p>
          ) : (
            <SetGrid
              sets={showStored ? storedSets : plannedSets}
              caption={
                showStored
                  ? "The questions in each set, as they are stored"
                  : "The questions each set would hold"
              }
            />
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={dealAgain} disabled={!formValid}>
              Deal again
            </Button>
            <p className="max-w-[60ch] text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
              Dealing again shuffles the bank with a new seed. The seed is stored with the contest,
              so any split can be re-derived later and shown to a student who disputes theirs.
              {shownSeed !== null && (
                <>
                  {" "}
                  This one came from seed <code className="numeric">{shownSeed}</code>.
                </>
              )}
            </p>
          </div>

          <p className="max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            Group questions are not part of any set: the whole team works them together and every
            team gets the same ones, so they are left alone by everything on this screen
            {stored === null ? "" : ` (there ${stored.groupProblemCount === 1 ? "is" : "are"} ${String(stored.groupProblemCount)} of them)`}
            . A question is designated Group or Individual on the{" "}
            <Link
              href={`/admin/contests/${contestId}/problems`}
              className="font-semibold underline underline-offset-2"
            >
              Problems tab
            </Link>
            .
          </p>
        </div>
      </Panel>

      <Panel title="Build">
        <div className="flex flex-col gap-group">
          {applyError !== null && (
            <p role="alert" className="max-w-[70ch] font-semibold text-panther" style={{ fontSize: "var(--text-sm)" }}>
              {applyError}
            </p>
          )}
          {applied !== null && (
            <p role="status" className="max-w-[70ch] font-semibold" style={{ fontSize: "var(--text-sm)" }}>
              {applied}
            </p>
          )}

          {confirming ? (
            <div className="flex flex-col gap-tight">
              <p className="max-w-[70ch]" style={{ fontSize: "var(--text-sm)" }}>
                <strong>This replaces the split that is there now.</strong> The columns keep their
                names, so a student already holding set B still holds set B, but every question
                inside every column changes. Group questions are not touched. It is recorded in the
                audit log with your name on it.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="danger"
                  disabled={applying}
                  onClick={() => void apply()}
                >
                  {applying ? "Building…" : "Replace the split"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="primary"
                disabled={applying || !buildable}
                onClick={() => {
                  if (storedSets.length > 0) {
                    setConfirming(true);
                    return;
                  }
                  void apply();
                }}
              >
                {applying ? "Building…" : "Build these sets"}
              </Button>
              <p className="max-w-[60ch] text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
                {!rebuildable
                  ? "The contest has started, so the split is fixed until it ends."
                  : buildable
                    ? storedSets.length > 0
                      ? "You will be asked to confirm, because this replaces the split that is there now."
                      : "Writes the split above and assigns every question its points."
                    : "There is nothing to build yet."}
              </p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
