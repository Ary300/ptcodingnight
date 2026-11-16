package ptcn.harness;

/**
 * The student's `main`, on a thread of its own made for one test.
 *
 * The thread is named "main", in a fresh thread group named "main" under the system group — what
 * the java launcher gives a program — and it is created with a stack several times the JVM's
 * default (Harness#studentStackBytes). That is the point of it: how deep a program can recurse
 * depends on how soon the JIT compiles its recursive method, and in a JVM that has already run
 * tests the compiler is often busy when the method gets hot, so more frames stay interpreted and
 * larger. A bigger stack makes the harness's worst case deeper than a fresh JVM's best, measured,
 * so recursion can only go further here than per process, never less far.
 *
 * An uncaught exception is reported here, on this thread, through its own uncaught-exception
 * handler — "Exception in thread "main" ..." — exactly as the JVM reports one, after the frames
 * beneath the student's are stripped (Frames#trim).
 */
final class StudentMain implements Runnable {
  private final TestRun run;
  private final State state;
  private volatile Throwable thrown;

  StudentMain(TestRun run, State state) {
    this.run = run;
    this.state = state;
  }

  Throwable thrown() {
    return thrown;
  }

  @Override
  public void run() {
    try {
      run.entry.invokeExact(new String[0]);
    } catch (Throwable t) {
      thrown = t;
      if (!(t instanceof ExitTrap) && !state.exitRequested()) {
        Frames.trim(t);
        Thread current = Thread.currentThread();
        try {
          current.getUncaughtExceptionHandler().uncaughtException(current, t);
        } catch (Throwable ignored) {
          // The JVM ignores a failing handler too.
        }
      }
    }
  }
}
