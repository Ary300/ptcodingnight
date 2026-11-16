package ptcn.harness;

import java.util.Set;

/**
 * How a test ends, in the order a fresh JVM ends it.
 *
 * Measured against `java -cp /build Main` on eclipse-temurin:21, the java launcher, when `main`
 * returns or throws:
 *   1. reports an uncaught exception through the thread's uncaught-exception handler,
 *      "Exception in thread "main" ..." on System.err;
 *   2. waits for every non-daemon thread to finish (DestroyJavaVM);
 *   3. exits 1 if `main` threw, else 0 — and flushes nothing that the program left buffered.
 * System.exit from any thread cuts all of that short; that path is State#onExit.
 */
final class Ending {
  private Ending() {}

  static void finish(TestRun run, Throwable thrown, State state, Control control, Set<Thread> baseline) {
    boolean threw = thrown != null && !(thrown instanceof ExitTrap);
    if (threw && !state.exitRequested()) {
      Frames.trim(thrown);
      Thread current = Thread.currentThread();
      try {
        current.getUncaughtExceptionHandler().uncaughtException(current, thrown);
      } catch (Throwable ignored) {
        // The JVM ignores a failing handler too.
      }
    }

    joinNonDaemon(state, baseline);

    if (state.claimFinish(run.ordinal)) {
      run.seal();
      control.send(Control.DONE, run.ordinal, threw ? 1 : 0);
    }
  }

  /** DestroyJavaVM's wait: every non-daemon thread the program started must finish first. */
  private static void joinNonDaemon(State state, Set<Thread> baseline) {
    Thread[] found = new Thread[8];
    while (!state.exitRequested() && TestRun.extraThreads(baseline, true, found)) {
      for (int i = 0; i < found.length && found[i] != null; i++) {
        try {
          found[i].join(50);
        } catch (InterruptedException e) {
          Thread.interrupted();
        }
        found[i] = null;
      }
    }
  }

  /**
   * Whether the NEXT test can run in this JVM. Anything short of a JVM indistinguishable from the
   * one the previous test started in sends the remaining tests to the per-process path:
   *   - the program created a thread, or anything still runs that the harness did not start;
   *   - the test reported a memory error (the heap may be in any state, and the host will call it
   *     MLE whatever happens next);
   *   - the test was aborted.
   * Processes are checked by the DRIVER, from /proc, after this reply: it is the one party that
   * knows which of the processes it sees are its own (it copies the results out while this runs).
   */
  static boolean clean(TestRun run, State state, Set<Thread> baseline) {
    // An exit taken off the main thread implies a thread was created, so it is covered here too.
    if (state.threadsCreated() || state.aborted()) {
      return false;
    }
    if (TestRun.extraThreads(baseline, false, null)) {
      return false;
    }
    return !run.reportsMemoryError();
  }
}
