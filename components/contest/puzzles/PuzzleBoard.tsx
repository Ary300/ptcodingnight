"use client";

import { useCallback, useState, type FormEvent } from "react";

import { Markdown } from "@/components/contest/markdown/Markdown";
import { Button } from "@/components/ui";
import { API_ROUTES, PuzzleListSchema, type Puzzle } from "@/lib/schemas/api";

import { useParticipant } from "../data/participant";
import { useResource } from "../data/useResource";

/**
 * The puzzle board: decode the binary, break the cipher, finish the sudoku.
 *
 * These exist for the student who has not written a program yet, so the screen asks for one thing
 * only: an answer typed into a box. No language picker, no editor, no verdict panel.
 *
 * ## What the copy is careful about
 *
 * A wrong answer is not a failure state here. There is no penalty, no attempt counter and no
 * scoreboard consequence, and the message says so, because the whole point of these is to keep
 * somebody playing who would otherwise sit out the round. The hint is one click and costs
 * nothing, for the same reason.
 *
 * Points land on the TEAM, once per puzzle, which the screen states before anybody types: two
 * teammates racing to submit is the normal case, and the second one should already know why they
 * were told it only pays once.
 */
export function PuzzleBoard() {
  const participant = useParticipant();
  const contestId =
    participant.status === "joined" ? participant.participant.contestId : null;
  const scopeKey = participant.status === "joined" ? participant.scopeKey : participant.status;

  const load = useCallback(async () => {
    if (contestId === null) return { puzzles: [] as Puzzle[] };
    const response = await fetch(API_ROUTES.puzzles(contestId), { cache: "no-store" });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error("Could not load the puzzles.");
    const data =
      typeof payload === "object" && payload !== null && "data" in payload
        ? (payload as { data: unknown }).data
        : null;
    return PuzzleListSchema.parse(data);
  }, [contestId]);

  const puzzles = useResource(load, scopeKey);

  if (participant.status !== "joined") {
    return (
      <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        Sign in with your join code to solve puzzles.
      </p>
    );
  }
  if (puzzles.status === "loading") {
    return (
      <p role="status" className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        Loading the puzzles…
      </p>
    );
  }
  if (puzzles.status === "error") {
    return (
      <p role="alert" className="font-semibold text-panther" style={{ fontSize: "var(--text-sm)" }}>
        {puzzles.error}
      </p>
    );
  }

  const list = puzzles.data.puzzles;
  const solved = list.filter((puzzle) => puzzle.solved).length;

  return (
    <div className="motion-swap-in flex flex-col gap-group">
      <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        A wrong answer costs nothing and you can try as many times as you like. Each puzzle pays
        your whole team, once.{" "}
        <span className="numeric font-semibold text-ink">
          {solved}/{list.length}
        </span>{" "}
        solved.
      </p>

      {list.length === 0 && (
        <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          No puzzles are open right now.
        </p>
      )}

      {list.map((puzzle) => (
        <PuzzleCard
          key={puzzle.slug}
          puzzle={puzzle}
          contestId={contestId ?? ""}
          onSolved={puzzles.reload}
        />
      ))}
    </div>
  );
}

function PuzzleCard({
  puzzle,
  contestId,
  onSolved,
}: {
  puzzle: Puzzle;
  contestId: string;
  onSolved: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [result, setResult] = useState<{ correct: boolean; message: string } | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(API_ROUTES.puzzleAttempt(contestId, puzzle.slug), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      const payload: unknown = await response.json();
      const data =
        typeof payload === "object" && payload !== null && "data" in payload
          ? (payload as { data: { correct: boolean; message: string } | null }).data
          : null;
      if (!response.ok || data === null) {
        setResult({ correct: false, message: "That could not be checked. Try again." });
        return;
      }
      setResult(data);
      // A correct answer changes the team's points and this card's solved state, so the list is
      // re-read rather than patched locally: the server is the only thing that knows both.
      if (data.correct) onSolved();
    } catch {
      setResult({ correct: false, message: "Could not reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-panel border border-rule-edge bg-paper p-4 sm:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
          {puzzle.title}
        </h3>
        <span className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          {puzzle.topic} · <span className="numeric">{puzzle.points}</span> points
        </span>
      </header>

      <Markdown source={puzzle.promptMd} className="mt-2 max-w-none" />

      {puzzle.solved ? (
        <p className="mt-3 font-semibold" style={{ fontSize: "var(--text-sm)" }}>
          Solved{puzzle.solvedBy === null ? "" : ` by ${puzzle.solvedBy}`}. Your team has the
          points.
        </p>
      ) : (
        <form className="mt-3 flex flex-col gap-2" onSubmit={(event) => void submit(event)}>
          {/*
            A sudoku answer is 81 characters and arrives with line breaks, so it gets a textarea;
            every other puzzle is a word or a number and gets one line. Same field, same submit.
          */}
          {puzzle.check === "SUDOKU" ? (
            <textarea
              aria-label={`Your answer for ${puzzle.title}`}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={9}
              spellCheck={false}
              placeholder={"530070000\n600195000\n098000060\n…"}
              // Monospace and nine rows wide, so the grid a student types looks like a grid. Any
              // spacing is accepted, and the columns lining up is how they check their own work.
              className="numeric w-full max-w-[30ch] rounded border border-ink/25 bg-paper px-3 py-2 tracking-[0.2em]"
              style={{ fontSize: "var(--text-sm)" }}
            />
          ) : (
            <input
              type="text"
              aria-label={`Your answer for ${puzzle.title}`}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Your answer"
              autoComplete="off"
              // Capped, because the answers are a word or a number. A field the width of the card
              // asks for a paragraph, and a student who has typed "228" into it wonders what else
              // the puzzle wanted.
              className="w-full max-w-[28ch] rounded border border-ink/25 bg-paper px-3 py-2"
              style={{ fontSize: "var(--text-sm)" }}
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy || answer.trim() === ""}>
              {busy ? "Checking…" : "Check my answer"}
            </Button>
            {puzzle.hint !== null && !showHint && (
              <Button type="button" variant="quiet" onClick={() => setShowHint(true)}>
                Show a hint
              </Button>
            )}
          </div>

          {showHint && puzzle.hint !== null && (
            <p className="motion-swap-in text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
              {puzzle.hint}
            </p>
          )}

          {result !== null && (
            <p
              role="status"
              className={`motion-swap-in font-semibold ${result.correct ? "" : "text-panther"}`}
              style={{ fontSize: "var(--text-sm)" }}
            >
              {result.message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
