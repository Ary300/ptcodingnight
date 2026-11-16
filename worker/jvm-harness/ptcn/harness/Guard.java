package ptcn.harness;

import java.io.FileDescriptor;
import java.security.Permission;

/**
 * A SecurityManager that grants everything and traps three things.
 *
 * It exists for System.exit, not for security. In a JVM shared by every test, a student's
 * `System.exit(0)` after printing the answer — normal, common, and accepted by the per-process
 * judge — would otherwise end the harness. Java 21 still honours a SecurityManager when the JVM is
 * started with -Djava.security.manager=allow, and checkExit is called by both Runtime.exit and
 * Runtime.halt before either does anything.
 *
 * Everything else is granted WITHOUT a stack walk, so a program pays nothing for the manager on
 * its hot paths: the per-call checks (file opens, property reads, package access on class load)
 * are overridden to return immediately, matching a JVM with no manager at all.
 *
 * The isolation of the submission is the container's job, as it is on the per-process path. Nothing
 * here is a sandbox.
 */
final class Guard extends SecurityManager {
  private final State state;

  Guard(State state) {
    this.state = state;
  }

  @Override
  public void checkExit(int status) {
    if (state.harnessExiting()) {
      return;
    }
    state.onExit(status);
    throw ExitTrap.INSTANCE;
  }

  /**
   * Called by the Thread constructor whenever a platform thread is created while a manager is
   * installed. A test that starts a thread is still judged here — the harness waits for its
   * non-daemon threads exactly as the JVM's exit does — but the tests after it go back to the
   * per-process path, so thread numbering, lingering daemons and pool workers never carry over.
   *
   * Only threads created from the student's side count: the test's own "main" thread or any thread
   * in its group. The harness creating that thread, and the VM creating its compiler threads in the
   * system group, are not the student's doing.
   */
  @Override
  public void checkAccess(ThreadGroup g) {
    Thread current = Thread.currentThread();
    ThreadGroup group = state.studentGroup();
    if (current == state.studentThread()
        || (group != null && current.getThreadGroup() != null && group.parentOf(current.getThreadGroup()))) {
      state.onThreadCreated();
    }
  }

  @Override
  public void checkAccess(Thread t) {
    // Granted: setName, setPriority, interrupt and friends behave as with no manager.
  }

  @Override
  public void checkPermission(Permission perm) {
    screen(perm);
  }

  @Override
  public void checkPermission(Permission perm, Object context) {
    screen(perm);
  }

  /**
   * Two runtime permissions mark a program the harness cannot reproduce: a shutdown hook (it
   * would run when THIS JVM exits, after other tests, instead of at the end of this one) and
   * replacing the security manager (it would disarm the exit trap). Either aborts the test, and the
   * driver reruns it — and every later test — as its own process, where both behave natively.
   */
  private void screen(Permission perm) {
    if (!(perm instanceof RuntimePermission)) {
      return;
    }
    String name = perm.getName();
    if ("shutdownHooks".equals(name) || "setSecurityManager".equals(name)) {
      state.abort();
      if ("setSecurityManager".equals(name)) {
        throw new SecurityException("ptcn: rerun as a process");
      }
    }
  }

  // The per-call checks below are granted outright, so they never allocate a Permission.

  @Override
  public void checkRead(String file) {}

  @Override
  public void checkRead(FileDescriptor fd) {}

  @Override
  public void checkRead(String file, Object context) {}

  @Override
  public void checkWrite(String file) {}

  @Override
  public void checkWrite(FileDescriptor fd) {}

  @Override
  public void checkDelete(String file) {}

  @Override
  public void checkPropertyAccess(String key) {}

  @Override
  public void checkPropertiesAccess() {}

  @Override
  public void checkPackageAccess(String pkg) {}

  @Override
  public void checkPackageDefinition(String pkg) {}

  @Override
  public void checkCreateClassLoader() {}

  @Override
  public void checkLink(String lib) {}

  @Override
  public void checkSetFactory() {}
}
