import { existsSync } from "node:fs";
import http from "node:http";

/**
 * Three container calls made over the Docker Engine API instead of the `docker` CLI: inspect,
 * remove, kill. Nothing here creates or starts a container, and nothing here sets a flag — the
 * isolation flags stay in `worker/docker.ts`'s `isolationArgs`, passed to `docker run` exactly as
 * before, so this file cannot weaken the sandbox.
 *
 * ## Why
 *
 * Every judged submission made a `docker inspect` and a `docker rm -f` per container — four CLI
 * processes for a compiled language. Each one is a Go binary that starts, parses its config,
 * dials the daemon and exits: ~15 ms of CPU on the development Mac, measured, and several times
 * that on a shared 2-vCPU droplet where the worker's container was already burning half a core.
 * The same request over the socket that the CLI would have dialled costs a millisecond of this
 * process.
 *
 * ## Fallback, never failure
 *
 * Each call returns `null` when the API cannot answer — no socket (a `tcp://` DOCKER_HOST, a
 * context the worker cannot see), a refused connection, a status this code does not expect — and
 * the caller then runs the CLI exactly as it always did. A judge that loses its API shortcut is a
 * slower judge, never a broken one.
 */

/** Where the daemon listens, if it is a unix socket this process can reach. */
export function dockerSocketPath(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const host = env.DOCKER_HOST;
  if (host !== undefined && host !== "") {
    return host.startsWith("unix://") ? host.slice("unix://".length) : null;
  }
  return existsSync(DEFAULT_SOCKET) ? DEFAULT_SOCKET : null;
}

const DEFAULT_SOCKET = "/var/run/docker.sock";

/** Long enough for a daemon under load to remove an overlay mount, short enough not to hang a slot. */
const REQUEST_TIMEOUT_MS = 30_000;

interface ApiResponse {
  readonly status: number;
  readonly body: string;
}

function request(method: string, apiPath: string): Promise<ApiResponse | null> {
  const socketPath = dockerSocketPath();
  if (socketPath === null) return Promise.resolve(null);

  return new Promise((resolve) => {
    const req = http.request(
      { socketPath, method, path: apiPath, timeout: REQUEST_TIMEOUT_MS },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          // An inspect document is a few kilobytes; anything far larger is not the reply we asked for.
          if (body.length < 1024 * 1024) body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
        res.on("error", () => resolve(null));
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}

/** A container name the worker composed — still encoded, because it goes into a URL path. */
function containerPath(name: string, suffix = ""): string {
  return `/containers/${encodeURIComponent(name)}${suffix}`;
}

export interface ContainerExitState {
  readonly oomKilled: boolean;
  readonly startedAt: string;
  readonly finishedAt: string;
  /**
   * `State.Status`. "removing" is the one the judge acts on: `docker rm -f` marks a container for
   * removal BEFORE it kills it, so a container somebody else removed reads as a clean exit with
   * this status in the moment between its client returning and the removal completing.
   */
  readonly status: string;
}

/**
 * `docker inspect`'s `State.OOMKilled`, `State.StartedAt` and `State.FinishedAt`, or `null` when
 * the API cannot say (the caller falls back to the CLI).
 */
export async function inspectExitState(name: string): Promise<ContainerExitState | null> {
  const res = await request("GET", containerPath(name, "/json"));
  if (res === null || res.status !== 200) return null;
  return parseExitState(res.body);
}

/** Pure, for the test: the three fields out of an inspect document, or null if any is missing. */
export function parseExitState(body: string): ContainerExitState | null {
  let doc: unknown;
  try {
    doc = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof doc !== "object" || doc === null) return null;
  const state = (doc as { State?: unknown }).State;
  if (typeof state !== "object" || state === null) return null;
  const { OOMKilled, StartedAt, FinishedAt, Status } = state as Record<string, unknown>;
  if (typeof OOMKilled !== "boolean") return null;
  if (typeof StartedAt !== "string" || typeof FinishedAt !== "string") return null;
  if (typeof Status !== "string") return null;
  return { oomKilled: OOMKilled, startedAt: StartedAt, finishedAt: FinishedAt, status: Status };
}

/**
 * `docker rm -f`. True when the container is gone (removed now, or already absent); null when the
 * API could not say, and the caller falls back to the CLI.
 */
export async function removeContainerViaApi(name: string): Promise<true | null> {
  const res = await request("DELETE", containerPath(name, "?force=1"));
  if (res === null) return null;
  return res.status === 204 || res.status === 404 ? true : null;
}

/** `docker kill`. Null when the API could not do it; a container that already exited counts as done. */
export async function killContainerViaApi(name: string): Promise<true | null> {
  const res = await request("POST", containerPath(name, "/kill"));
  if (res === null) return null;
  // 409: not running — it has already stopped, which is what the kill was for.
  return res.status === 204 || res.status === 404 || res.status === 409 ? true : null;
}
