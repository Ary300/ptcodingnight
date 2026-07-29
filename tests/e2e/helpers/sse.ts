/**
 * A minimal server-sent-events reader for the specs.
 *
 * Playwright's `APIRequestContext` buffers a response body to completion, and the contest
 * stream stays open for thirty minutes — so reading it through that fixture would hang. This
 * uses `fetch` directly and aborts as soon as the caller has seen what it is waiting for.
 *
 * Deliberately not an `EventSource` polyfill: the specs need the raw frames, including the
 * `: ping` comments, to assert that the keep-alive is there.
 */

export interface SseEvent {
  readonly event: string;
  readonly data: string;
}

export interface CollectOptions {
  readonly url: string;
  readonly cookie: string | null;
  readonly timeoutMs: number;
  /** Stop as soon as this returns true for the events collected so far. */
  readonly until: (events: readonly SseEvent[]) => boolean;
  /** Called once the stream is open, before waiting — for triggering the event under test. */
  readonly onOpen?: () => Promise<void>;
}

function parseFrames(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";

  for (const part of parts) {
    let name = "message";
    const data: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) name = line.slice("event:".length).trim();
      else if (line.startsWith("data:")) data.push(line.slice("data:".length).trim());
      else if (line.startsWith(":")) name = "comment";
    }
    events.push({ event: name, data: data.join("\n") });
  }

  return { events, rest };
}

export async function collectSse(options: CollectOptions): Promise<SseEvent[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const collected: SseEvent[] = [];

  try {
    const response = await fetch(options.url, {
      headers: {
        accept: "text/event-stream",
        ...(options.cookie === null ? {} : { cookie: options.cookie }),
      },
      signal: controller.signal,
    });

    if (!response.ok || response.body === null) {
      throw new Error(`stream ${options.url} responded ${response.status}`);
    }

    if (options.onOpen !== undefined) await options.onOpen();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parsed = parseFrames(buffer);
      buffer = parsed.rest;
      collected.push(...parsed.events);

      if (options.until(collected)) break;
    }
  } catch (error: unknown) {
    if (!(error instanceof Error) || error.name !== "AbortError") throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }

  return collected;
}
