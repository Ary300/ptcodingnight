package ptcn.harness;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;
import java.util.concurrent.locks.LockSupport;

/**
 * Runs every test of one Java submission inside ONE JVM, each against a fresh class loader.
 *
 * The per-process path pays JVM startup once per test — about 17 times per submission, which is
 * most of a Java submission's judge time. Here it is paid once. Everything a student can observe is
 * kept as a fresh process would show it (see TestRun, Globals, Guard, FrameFilter), and anything the
 * harness cannot reproduce faithfully is not attempted: it reports `abort` or `dirty`, and the
 * driver (worker/jvm-driver.ts) runs the affected tests as ordinary processes instead.
 *
 * The student's `main` runs on THIS thread — the JVM's own main thread, which the java launcher
 * created exactly as it does for a per-process run — so the thread's name, group, id and stack size
 * are the ones a student's program has always seen. The only extra frame beneath the student's is
 * this method's, which is why the invocation is written inline below and nowhere else.
 */
public final class Harness {
  /** Bumped whenever the driver protocol changes; the driver refuses a harness that disagrees. */
  static final int PROTOCOL = 2;

  private Harness() {}

  public static void main(String[] args) throws Exception {
    Config cfg = Config.parse(args);
    Control control = Control.open();
    State state = new State(control, Thread.currentThread());
    Thread main = Thread.currentThread();
    Globals globals = Globals.capture(main);

    Thread watchdog = new Thread(() -> watch(control, state, cfg), "ptcn-watchdog");
    watchdog.setDaemon(true);
    watchdog.start();

    Set<Thread> baseline = Collections.newSetFromMap(new IdentityHashMap<>());
    baseline.addAll(Thread.getAllStackTraces().keySet());

    System.setSecurityManager(new Guard(state, main));
    // The kernel's id for this thread, which runs every test. The driver watches it in /proc to
    // confirm a test has really ended, so it is sent now, before any student code can exist.
    control.send(Control.READY, PROTOCOL, mainThreadTid());

    for (;;) {
      int ordinal = state.awaitNext();
      if (ordinal < 0) {
        state.allowHarnessExit();
        Runtime.getRuntime().halt(0);
      }
      TestRun run = TestRun.prepare(cfg, ordinal, globals);
      if (run == null) {
        state.abort();
        parkForever();
      }
      state.attach(run);

      Throwable thrown = null;
      try {
        run.entry.invokeExact(new String[0]);
      } catch (Throwable t) {
        thrown = t;
      }

      Ending.finish(run, thrown, state, control, baseline);
      boolean clean = Ending.clean(run, state, baseline);
      run.release();
      run = null;
      thrown = null;
      globals.restore();
      System.gc();

      control.send(clean ? Control.OK : Control.DIRTY, ordinal, -1);
      state.idle();
      if (!clean) {
        // Something of this test may still be running in here. The driver kills this JVM and runs
        // the remaining tests as processes; this thread must not pick up another one meanwhile.
        parkForever();
      }
    }
  }

  /**
   * The watchdog: reads the driver's commands and enforces each test's wall-clock limit.
   *
   * On a timeout it does not try to recover the stuck thread. It reports `tle` and stops; the
   * driver kills the whole JVM and the remaining tests run as processes, so a hang costs what it
   * costs on the per-process path.
   */
  private static void watch(Control control, State state, Config cfg) {
    try {
      for (;;) {
        String line = control.readLine();
        if (line == null || line.equals("quit")) {
          state.quit();
          return;
        }
        if (!line.startsWith("run ")) {
          continue;
        }
        int ordinal;
        try {
          ordinal = Integer.parseInt(line.substring(4).trim());
        } catch (NumberFormatException e) {
          continue;
        }
        if (ordinal <= 0) {
          continue;
        }
        state.awaitIdle();
        if (!state.runAndWatch(ordinal, cfg.timeoutMs)) {
          control.send(Control.TLE, ordinal, -1);
          parkForever();
        }
        state.awaitIdle();
      }
    } catch (Throwable t) {
      // A watchdog that cannot watch must not leave a test unbounded: stop answering, and the
      // driver's own backstop reruns the test as a process.
      state.quit();
    }
  }

  /** This thread's id in /proc: `/proc/thread-self` links to `<pid>/task/<tid>`. */
  private static int mainThreadTid() throws java.io.IOException {
    return Integer.parseInt(Files.readSymbolicLink(Path.of("/proc/thread-self")).getFileName().toString());
  }

  static void parkForever() {
    for (;;) {
      LockSupport.park();
    }
  }
}
