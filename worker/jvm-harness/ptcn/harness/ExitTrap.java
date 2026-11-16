package ptcn.harness;

/**
 * Thrown out of System.exit / Runtime.halt in student code, to unwind the calling thread.
 *
 * An Error rather than a SecurityException so `catch (Exception e)` in student code does not
 * swallow it. A student who catches Throwable can still swallow it, and that is handled: the exit
 * status and the output were frozen BEFORE this was thrown (see State#onExit), so nothing the
 * student does afterwards reaches the test's result, exactly as nothing runs after a real exit.
 *
 * One preallocated instance with no stack trace: the exit path may run with the heap full.
 */
final class ExitTrap extends Error {
  private static final long serialVersionUID = 1L;

  static final ExitTrap INSTANCE = new ExitTrap();

  private ExitTrap() {
    super(null, null, false, false);
  }
}
