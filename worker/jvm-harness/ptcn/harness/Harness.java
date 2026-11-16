package ptcn.harness;

import com.sun.management.HotSpotDiagnosticMXBean;
import java.lang.management.ManagementFactory;
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
 * The student's `main` runs on a fresh thread for each test (StudentMain): named "main", in a fresh
 * "main" thread group, with a stack several times the JVM's default so that recursion reaches at
 * least as deep as in a fresh JVM. This thread waits for it.
 */
public final class Harness {
  /** Bumped whenever the driver protocol changes; the driver refuses a harness that disagrees. */
  static final int PROTOCOL = 2;

  /**
   * The student's thread's stack, as a multiple of the JVM's default thread stack (the size the
   * java launcher gives `main`). Measured on eclipse-temurin:21 for a two-argument recursive
   * method: a fresh JVM reaches 20,372 to 26,946 frames on the default stack, and 82,628 once C2 has
   * compiled the method; the all-interpreted floor is 15,490. Eight times the default puts this
   * harness's floor near 124,000 frames, above every fresh-JVM measurement. See the commit that
   * introduced it for the per-shape measurements.
   */
  static final long STACK_MULTIPLE = 8;

  private Harness() {}

  public static void main(String[] args) throws Exception {
    Config cfg = Config.parse(args);
    Control control = Control.open();
    State state = new State(control);
    Thread main = Thread.currentThread();
    Globals globals = Globals.capture(main);

    Thread watchdog = new Thread(() -> watch(control, state, cfg), "ptcn-watchdog");
    watchdog.setDaemon(true);
    watchdog.start();

    Set<Thread> baseline = Collections.newSetFromMap(new IdentityHashMap<>());
    baseline.addAll(Thread.getAllStackTraces().keySet());

    long stackBytes = studentStackBytes();
    ThreadGroup systemGroup = main.getThreadGroup().getParent();
    System.setSecurityManager(new Guard(state));
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

      ThreadGroup group = new ThreadGroup(systemGroup, "main");
      StudentMain body = new StudentMain(run, state);
      Thread student = new Thread(group, body, "main", stackBytes);
      student.setContextClassLoader(run.loader());
      state.student(student, group);
      student.start();
      joinUninterruptibly(student);

      Throwable thrown = body.thrown();
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

  private static void joinUninterruptibly(Thread thread) {
    while (thread.isAlive()) {
      try {
        thread.join();
      } catch (InterruptedException e) {
        Thread.interrupted();
      }
    }
  }

  /** The JVM's default thread stack (`-XX:ThreadStackSize`, in KB) times STACK_MULTIPLE. */
  private static long studentStackBytes() {
    HotSpotDiagnosticMXBean vm = ManagementFactory.getPlatformMXBean(HotSpotDiagnosticMXBean.class);
    long defaultKb = Long.parseLong(vm.getVMOption("ThreadStackSize").getValue());
    return defaultKb * 1024L * STACK_MULTIPLE;
  }

  static void parkForever() {
    for (;;) {
      LockSupport.park();
    }
  }
}
