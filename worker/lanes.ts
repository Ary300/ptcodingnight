/**
 * Main lanes and the slow lane.
 *
 * ## Why
 *
 * A TLE test holds a lane for its whole threshold (8.25 s for Java), and once a Java submission has
 * had one, the harness hands every later test to a fresh JVM. Measured on the droplet: 8 Java
 * submissions that time out on every one of 14-18 tests held all 6 lanes for about 2.5 minutes,
 * and the last ordinary student among 35 waited 176 s.
 *
 * ## What
 *
 * Every job starts in a MAIN lane; there are `main` of them, which is the worker's concurrency.
 * When a test of a submission ends over its threshold, the submission may DEMOTE: it gives its main
 * lane back (the worker's concurrency rises by one, so the queue's next job starts at once) and is
 * PARKED. A parked submission runs each of its remaining tests only with a slow-lane slot:
 *
 *   - one of `slow` slots reserved for it, machine-wide (per worker; the droplet runs one), or
 *   - a BORROWED main lane, when fewer than `main` ordinary jobs are running — so a quiet judge
 *     still runs timing-out submissions at full width, and a busy one runs them two at a time.
 *
 * Between tests a parked submission's container waits on its doorbell and costs no CPU; its memory
 * cap is a ceiling, not an allocation, and the driver it runs is a shell. `maxParked` bounds how
 * many there are. With all parked places taken, a submission keeps its main lane and runs as before.
 *
 * Nothing here touches a test: when it starts, it runs exactly as it would have, under the same
 * limit, measured the same way. Only the moment its input is handed over moves.
 */

export interface LaneOptions {
  /** Main lanes: the worker's concurrency before any parking. */
  readonly main: number;
  /** Tests of parked submissions that may run at once on reserved slots. */
  readonly slow: number;
  /** Submissions that may be parked at once. */
  readonly maxParked: number;
  /** Told the worker's concurrency whenever it changes: main + parked. */
  readonly onConcurrency?: (concurrency: number) => void;
}

/** One submission's view of the lanes. */
export interface SubmissionLane {
  /** Give the main lane back and park. False when no parked place is free; nothing changes then. */
  demote(): boolean;
  /** Whether this submission is parked. */
  readonly parked: boolean;
  /** Wait for a slot to run one test of a parked submission. Resolves to its release. */
  testSlot(): Promise<() => void>;
}

export interface LaneStats {
  readonly main: number;
  readonly parked: number;
  readonly slowRunning: number;
  readonly borrowed: number;
  readonly waiting: number;
}

export class LaneScheduler {
  private activeMain = 0;
  private parked = 0;
  private slowRunning = 0;
  private borrowed = 0;
  /** Tests waiting for a slot, oldest first. Each takes a slot if it can and says whether it did. */
  private readonly waiters: (() => boolean)[] = [];

  constructor(private readonly options: LaneOptions) {
    if (options.main < 1 || options.slow < 1 || options.maxParked < 0) {
      throw new Error("lanes need main >= 1, slow >= 1, maxParked >= 0");
    }
  }

  /** The concurrency the worker should run at now. */
  concurrency(): number {
    return this.options.main + this.parked;
  }

  stats(): LaneStats {
    return {
      main: this.activeMain,
      parked: this.parked,
      slowRunning: this.slowRunning,
      borrowed: this.borrowed,
      waiting: this.waiters.length,
    };
  }

  /** A job has started: it holds a main lane until it demotes or finishes. */
  enter(): SubmissionLane & { finish(): void } {
    this.activeMain += 1;
    let parked = false;
    let finished = false;
    // A slot this submission still holds when it finishes (its container died mid-test).
    let held: (() => void) | null = null;
    return {
      get parked() {
        return parked;
      },
      demote: () => {
        if (parked || finished || this.parked >= this.options.maxParked) return false;
        parked = true;
        this.activeMain -= 1;
        this.parked += 1;
        this.options.onConcurrency?.(this.concurrency());
        this.wake();
        return true;
      },
      testSlot: async () => {
        const release = await this.acquire();
        held = release;
        return () => {
          if (held === release) held = null;
          release();
        };
      },
      finish: () => {
        if (finished) return;
        finished = true;
        held?.();
        held = null;
        if (parked) {
          this.parked -= 1;
          this.options.onConcurrency?.(this.concurrency());
        } else {
          this.activeMain -= 1;
        }
        this.wake();
      },
    };
  }

  private acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const attempt = (): boolean => {
        const release = this.tryTake();
        if (release === null) return false;
        resolve(release);
        return true;
      };
      if (!attempt()) this.waiters.push(attempt);
    });
  }

  /** A reserved slot first; otherwise a main lane nobody ordinary is using. */
  private tryTake(): (() => void) | null {
    if (this.slowRunning < this.options.slow) {
      this.slowRunning += 1;
      return this.once(() => {
        this.slowRunning -= 1;
      });
    }
    if (this.activeMain + this.borrowed < this.options.main) {
      this.borrowed += 1;
      return this.once(() => {
        this.borrowed -= 1;
      });
    }
    return null;
  }

  private once(release: () => void): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      release();
      this.wake();
    };
  }

  /** Let waiting tests take slots, oldest first, for as long as there are slots. */
  private wake(): void {
    while (this.waiters.length > 0) {
      const oldest = this.waiters[0];
      if (oldest === undefined || !oldest()) return;
      this.waiters.shift();
    }
  }
}
