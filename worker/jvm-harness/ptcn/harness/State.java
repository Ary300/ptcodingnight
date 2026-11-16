package ptcn.harness;

/**
 * What the main thread, the watchdog and the exit trap agree on about the current test.
 *
 * Exactly one of three parties ends a test and reports it — the main thread when the program
 * returns or throws, the exit trap when the program calls System.exit, the watchdog when the
 * deadline passes. `claimFinish` decides which, under one lock, so the driver never sees two
 * results for one test.
 *
 * The lock is a private object. Nothing a student can reach is ever synchronized on: the
 * SecurityManager is reachable through System.getSecurityManager(), and a program that held its
 * monitor would otherwise be able to stall the watchdog.
 */
final class State {
  private final Object lock = new Object();
  private final Control control;
  private final Thread mainThread;

  /** Ordinal handed to the main thread and not yet picked up. 0 none, -1 quit. */
  private int pending;
  /** Ordinal of the test in progress, 0 between tests. */
  private int active;
  private boolean finished;
  private boolean exitRequested;
  private int exitStatus;
  private TestRun run;

  /** Thread creation was observed during the current test (Guard#checkAccess). */
  private volatile boolean threadsCreated;
  /** Something the harness cannot reproduce faithfully happened; the driver reruns this test. */
  private volatile boolean aborted;
  /** Only the harness itself may exit, and only once it has said so here. */
  private volatile boolean harnessExiting;

  State(Control control, Thread mainThread) {
    this.control = control;
    this.mainThread = mainThread;
  }

  /* ---------------- driver side (watchdog thread) ---------------- */

  /** Start test `ordinal` and wait for it to end, up to `timeoutMs`. False means it timed out. */
  boolean runAndWatch(int ordinal, long timeoutMs) throws InterruptedException {
    long deadline = System.nanoTime() + timeoutMs * 1_000_000L;
    synchronized (lock) {
      pending = ordinal;
      active = ordinal;
      finished = false;
      exitRequested = false;
      exitStatus = 0;
      threadsCreated = false;
      aborted = false;
      lock.notifyAll();
      while (!finished) {
        long left = (deadline - System.nanoTime()) / 1_000_000L;
        if (left <= 0) {
          finished = true;
          return false;
        }
        lock.wait(left);
      }
      return true;
    }
  }

  void quit() {
    synchronized (lock) {
      pending = -1;
      lock.notifyAll();
    }
  }

  /** Block the watchdog until the main thread has finished its post-test work. */
  void awaitIdle() throws InterruptedException {
    synchronized (lock) {
      while (active != 0) {
        lock.wait();
      }
    }
  }

  /* ---------------- main thread ---------------- */

  int awaitNext() throws InterruptedException {
    synchronized (lock) {
      while (pending == 0) {
        lock.wait();
      }
      int next = pending;
      pending = 0;
      return next;
    }
  }

  void attach(TestRun current) {
    synchronized (lock) {
      run = current;
    }
  }

  /** The main thread is done with the test, including its post-test checks. */
  void idle() {
    synchronized (lock) {
      run = null;
      active = 0;
      lock.notifyAll();
    }
  }

  /** True once, for whoever ends the test. */
  boolean claimFinish(int ordinal) {
    synchronized (lock) {
      if (active != ordinal || finished) {
        return false;
      }
      finished = true;
      lock.notifyAll();
      return true;
    }
  }

  boolean exitRequested() {
    synchronized (lock) {
      return exitRequested;
    }
  }

  int exitStatus() {
    synchronized (lock) {
      return exitStatus;
    }
  }

  /* ---------------- student threads (via Guard) ---------------- */

  /**
   * System.exit / Runtime.halt from any student thread.
   *
   * A real exit ends the process on the spot: whatever was flushed is the output, the status is
   * `status & 0xFF`, and every other thread is gone. So the output is sealed and the result
   * reported HERE, on the exiting thread, before it unwinds — nothing after this line of the
   * student's program can change the result, whether or not it swallows the ExitTrap.
   */
  void onExit(int status) {
    TestRun current;
    int ordinal;
    synchronized (lock) {
      if (active == 0 || finished || exitRequested) {
        return;
      }
      exitRequested = true;
      exitStatus = status & 0xFF;
      current = run;
      ordinal = active;
    }
    if (current != null) {
      current.seal();
    }
    if (claimFinish(ordinal)) {
      control.send(Control.DONE, ordinal, status & 0xFF);
      if (Thread.currentThread() != mainThread) {
        // The student's main may still be running, and a real exit would have ended it. This JVM
        // cannot be used again, and there is no reason to make the driver wait to find that out.
        control.send(Control.DIRTY, ordinal, -1);
      }
    }
  }

  void onThreadCreated() {
    if (activeTest() != 0) {
      threadsCreated = true;
    }
  }

  boolean threadsCreated() {
    return threadsCreated;
  }

  /** The test cannot be judged faithfully in this JVM. Say so at once; the driver kills us. */
  void abort() {
    int ordinal = activeTest();
    if (ordinal != 0 && !aborted) {
      aborted = true;
      control.send(Control.ABORT, ordinal, -1);
    }
  }

  boolean aborted() {
    return aborted;
  }

  int activeTest() {
    synchronized (lock) {
      return active;
    }
  }

  void allowHarnessExit() {
    harnessExiting = true;
  }

  boolean harnessExiting() {
    return harnessExiting;
  }
}
