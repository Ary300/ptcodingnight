import { randomBytes } from "node:crypto";

import { CONTAINER_PREFIX, createContainer, removeContainer, type ContainerSpec } from "@/worker/docker";
import { profileKey, specsFor, type SlotNames, type SlotProfile } from "@/worker/slot-profile";
import { createWorkspace, removeWorkspace, type Workspace } from "@/worker/workspace";

/** The pool's side effects, injectable so its bookkeeping can be tested without a daemon. */
export interface PoolOps {
  readonly createContainer: (spec: ContainerSpec) => Promise<boolean>;
  readonly removeContainer: (name: string) => Promise<void>;
  readonly createWorkspace: (prefix: string) => Promise<Workspace>;
  readonly removeWorkspace: (root: string) => Promise<void>;
}

const DOCKER_OPS: PoolOps = { createContainer, removeContainer, createWorkspace, removeWorkspace };

/**
 * Containers made BEFORE their submission arrives, and removed after the burst is over.
 *
 * A submission used to pay `docker create` and `docker rm` for each of its containers while the
 * box was busiest. Measured on Docker Desktop, host CPU per judge-shaped container: create ~0.3 s,
 * start ~0.36 s, rm ~0.21 s. A burst now pays only the start: the containers were created while
 * the queue was idle, and the finished ones are removed once it is idle again.
 *
 * What does NOT change:
 *   - A container runs for exactly ONE submission. A slot is taken once and never returned; a
 *     container that was never started is removed, not handed to anyone else.
 *   - Its creation arguments are exactly an on-demand container's: both come from `specsFor`
 *     (worker/slot-profile.ts) and `containerArgs` (worker/docker.ts).
 *   - Its exit state — OOMKilled, StartedAt, FinishedAt — is read when it exits, as before.
 *     Only `docker rm` is deferred.
 *   - Everything is named with CONTAINER_PREFIX, so the prefix sweep at worker start and stop
 *     removes pooled and pending-removal containers alike.
 *
 * A slot is a workspace plus its containers, because the build and run containers of one
 * submission share the workspace's directories as their mounts.
 */
export interface PoolSlot {
  readonly key: string;
  readonly profile: SlotProfile;
  readonly workspace: Workspace;
  readonly names: SlotNames;
}

export interface PoolOptions {
  /** Slots to keep ready, across all profiles. */
  readonly target: number;
  /** Finished containers tolerated before they are removed even while judging. */
  readonly removalBacklog: number;
  /** A judge is running or about to: creation and idle-time removal wait. */
  readonly isBusy: () => boolean;
}

/** How many recent takes decide the share of each profile when the pool is refilled. */
const DEMAND_WINDOW = 200;

export class ContainerPool {
  private readonly ready = new Map<string, PoolSlot[]>();
  private readonly profiles = new Map<string, SlotProfile>();
  private readonly recent: string[] = [];
  private readonly pending: string[] = [];
  private readonly queued = new Set<string>();
  private maintaining = false;
  private closed = false;

  constructor(
    private readonly options: PoolOptions,
    private readonly ops: PoolOps = DOCKER_OPS,
  ) {}

  /** A ready slot for this profile, or null. Synchronous, so no two submissions can take one. */
  take(profile: SlotProfile): PoolSlot | null {
    const key = profileKey(profile);
    this.profiles.set(key, profile);
    this.recent.push(key);
    if (this.recent.length > DEMAND_WINDOW) this.recent.shift();
    const slot = this.ready.get(key)?.pop() ?? null;
    return slot;
  }

  /** Declare a profile worth keeping ready before any submission has asked for it. */
  expect(profile: SlotProfile, weight = 1): void {
    const key = profileKey(profile);
    this.profiles.set(key, profile);
    for (let i = 0; i < weight; i += 1) this.recent.push(key);
    while (this.recent.length > DEMAND_WINDOW) this.recent.shift();
  }

  /**
   * Queue a container for removal. Its exit state has already been read. Removed when the judge is
   * idle, or at once for whatever exceeds the backlog bound, so a long burst cannot pile up an
   * unbounded number of exited containers.
   */
  retire(name: string): void {
    if (this.queued.has(name)) return;
    this.queued.add(name);
    this.pending.push(name);
    const excess = this.pending.length - this.options.removalBacklog;
    if (excess > 0) void this.removePending(excess, false);
  }

  /** Every container of a slot that its submission did not start goes to removal, unused. */
  discardUnused(slot: PoolSlot): void {
    for (const name of [slot.names.build, slot.names.run]) {
      if (name !== null) this.retire(name);
    }
  }

  /** Create `count` more slots of a profile now, busy or not. For tests, benches and warm-up. */
  async prefill(profile: SlotProfile, count: number): Promise<number> {
    this.profiles.set(profileKey(profile), profile);
    let made = 0;
    for (let i = 0; i < count && !this.closed; i += 1) {
      if (await this.createSlot(profile)) made += 1;
    }
    return made;
  }

  /**
   * Idle-time work: remove finished containers, then refill toward the target in proportion to
   * recent demand. Stops at once if a judge starts.
   */
  async maintain(): Promise<void> {
    if (this.maintaining || this.closed) return;
    this.maintaining = true;
    try {
      await this.removePending(this.pending.length, true);
      await this.refill();
    } finally {
      this.maintaining = false;
    }
  }

  /** Remove everything: ready slots and their workspaces, and every pending removal. */
  async close(): Promise<void> {
    this.closed = true;
    const slots = [...this.ready.values()].flat();
    this.ready.clear();
    for (const slot of slots) {
      for (const name of [slot.names.build, slot.names.run]) {
        if (name !== null) await this.ops.removeContainer(name);
      }
      await this.ops.removeWorkspace(slot.workspace.root);
    }
    await this.removePending(this.pending.length, false);
  }

  stats(): { readonly ready: number; readonly pendingRemoval: number } {
    let ready = 0;
    for (const slots of this.ready.values()) ready += slots.length;
    return { ready, pendingRemoval: this.pending.length };
  }

  private async removePending(count: number, stopIfBusy: boolean): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      if (stopIfBusy && this.options.isBusy()) return;
      const name = this.pending.shift();
      if (name === undefined) return;
      await this.ops.removeContainer(name);
      this.queued.delete(name);
    }
  }

  private async refill(): Promise<void> {
    const total = this.recent.length;
    if (total === 0) return;
    const counts = new Map<string, number>();
    for (const key of this.recent) counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const [key, seen] of counts) {
      const profile = this.profiles.get(key);
      if (profile === undefined) continue;
      const want = Math.max(1, Math.round((this.options.target * seen) / total));
      while ((this.ready.get(key)?.length ?? 0) < want && this.stats().ready < this.options.target) {
        if (this.closed || this.options.isBusy()) return;
        if (!(await this.createSlot(profile))) return;
      }
    }
  }

  private async createSlot(profile: SlotProfile): Promise<boolean> {
    const workspace = await this.ops.createWorkspace("pool-");
    const id = randomBytes(6).toString("hex");
    const names: SlotNames = {
      build: profile.compile === null ? null : `${CONTAINER_PREFIX}pool-${id}-build`,
      run: `${CONTAINER_PREFIX}pool-${id}-run`,
    };
    const specs = specsFor(profile, workspace, names);
    const created: string[] = [];
    for (const spec of [specs.compile, specs.run]) {
      if (spec === null) continue;
      if (!(await this.ops.createContainer(spec))) {
        for (const name of created) await this.ops.removeContainer(name);
        await this.ops.removeContainer(spec.name);
        await this.ops.removeWorkspace(workspace.root);
        return false;
      }
      created.push(spec.name);
    }
    if (this.closed) {
      for (const name of created) await this.ops.removeContainer(name);
      await this.ops.removeWorkspace(workspace.root);
      return false;
    }
    const key = profileKey(profile);
    const slots = this.ready.get(key) ?? [];
    slots.push({ key, profile, workspace, names });
    this.ready.set(key, slots);
    return true;
  }
}
