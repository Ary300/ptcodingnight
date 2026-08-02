"use client";

import { useEffect, useState } from "react";

import { SSE_EVENTS, VerdictEventSchema, type SubmissionView } from "@/lib/schemas/api";

import { contestApi, errorMessageOf } from "./backend";

/**
 * Live verdicts: Server-Sent Events, with polling as a first-class fallback.
 *
 * PRD §10 requires both, and the contract is explicit that every SSE event must also be
 * derivable from a plain GET — no state exists only in the stream. That is what makes the
 * fallback a *mode* rather than a degraded path: if the stream never opens, or drops
 * halfway through judging, polling produces the same final answer.
 *
 * School Wi-Fi is the reason. A stream that dies at test 4 of 12 must not leave a student
 * looking at a half-judged submission for the rest of the round.
 *
 * ## Why every piece of state here is tagged with a submission id
 *
 * Each value is derived, and falls back to the seed whenever its tag does not match the
 * submission currently being watched. That replaces the usual "reset everything in an effect
 * when the id changes" pass, which is a synchronous setState inside an effect body — a
 * cascading render, and rejected by the React Compiler rules. It also removes the frame
 * where the *previous* submission's verdict is still on screen under the new one's heading.
 *
 * The transport is derived the same way: whether a stream is even possible is known
 * synchronously from `verdictStreamUrl`, so only the sse-to-polling *fallback* needs state,
 * and that transition is recorded from the stream's error callback where setState is fine.
 */

const POLL_INTERVAL_MS = 1_000;
/** Stop chasing a verdict eventually; the judge has a wall-clock kill of its own. */
const MAX_WAIT_MS = 5 * 60_000;

export type StreamTransport = "sse" | "polling";

export interface VerdictStreamState {
  submission: SubmissionView | null;
  transport: StreamTransport | null;
  /** `waiting` means judging is still in flight. */
  status: "idle" | "waiting" | "settled" | "error";
  error: string | null;
}

interface Tagged<T> {
  submissionId: string;
  value: T;
}

export function useVerdictStream(seed: SubmissionView | null): VerdictStreamState {
  const [update, setUpdate] = useState<Tagged<SubmissionView> | null>(null);
  const [failure, setFailure] = useState<Tagged<string> | null>(null);
  /** The submission whose stream dropped and handed over to polling. */
  const [fellBack, setFellBack] = useState<string | null>(null);

  const submissionId = seed?.submissionId ?? null;
  const streamUrl = submissionId === null ? null : contestApi.verdictStreamUrl(submissionId);
  const polling = streamUrl === null || fellBack === submissionId;

  useEffect(() => {
    if (submissionId === null) return;

    let cancelled = false;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const startedAt = Date.now();

    const stop = () => {
      if (source !== null) {
        source.close();
        source = null;
      }
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const poll = async () => {
      try {
        const next = await contestApi.getSubmission(submissionId);
        if (cancelled) return;
        setUpdate({ submissionId, value: next });
        if (next.verdict !== null) stop();
      } catch (caught: unknown) {
        if (cancelled) return;
        setFailure({ submissionId, value: errorMessageOf(caught) });
        stop();
      }
    };

    if (polling || streamUrl === null) {
      void poll();
      timer = setInterval(() => {
        if (Date.now() - startedAt > MAX_WAIT_MS) {
          stop();
          setFailure({
            submissionId,
            value: "Still waiting on the judge. Your submission is saved. Tell an organizer.",
          });
          return;
        }
        void poll();
      }, POLL_INTERVAL_MS);
    } else {
      source = new EventSource(streamUrl);

      source.addEventListener(SSE_EVENTS.verdict, (event: Event) => {
        if (cancelled || !(event instanceof MessageEvent)) return;

        let payload: unknown;
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }

        // Parse, never cast. A stream frame is as untrusted as any other input.
        const parsed = VerdictEventSchema.safeParse(payload);
        if (!parsed.success) return;

        const frame = parsed.data;
        setUpdate((previous) => {
          const base = previous !== null && previous.submissionId === submissionId
            ? previous.value
            : seed;
          if (base === null) return previous;
          return {
            submissionId,
            value: {
              ...base,
              verdict: frame.verdict,
              score: frame.score,
              testResults: frame.testResults,
            },
          };
        });
        if (frame.verdict !== null) stop();
      });

      // A dropped stream is not an error the student should ever see. Record the handover
      // and let the effect re-run in polling mode.
      source.onerror = () => {
        if (cancelled) return;
        stop();
        setFellBack(submissionId);
      };
    }

    return () => {
      cancelled = true;
      stop();
    };
  }, [submissionId, polling, streamUrl, seed]);

  const submission =
    update !== null && update.submissionId === submissionId ? update.value : seed;
  const error = failure !== null && failure.submissionId === submissionId ? failure.value : null;
  const transport: StreamTransport | null =
    submissionId === null ? null : polling ? "polling" : "sse";

  const status: VerdictStreamState["status"] =
    error !== null
      ? "error"
      : submission === null
        ? "idle"
        : submission.verdict === null
          ? "waiting"
          : "settled";

  return { submission, transport, status, error };
}
