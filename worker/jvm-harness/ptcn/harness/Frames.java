package ptcn.harness;

import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;

/**
 * Strips the frames beneath the student's code from an uncaught exception before it is reported.
 *
 * On the per-process path the java launcher calls `main` from native code, so the bottom frame of
 * any trace on the main thread is the student's own — `Main.main`, or `Main.<clinit>` — or there
 * are no frames at all (an ExceptionInInitializerError raised by the VM while initializing `Main`).
 * Here the bottom is `Harness.main`, and when the class is initialized by the first invocation, the
 * method-handle machinery that initialized it (`DirectMethodHandle.ensureInitialized`,
 * `Unsafe.ensureClassInitialized`) sits above that.
 *
 * Every one of those frames belongs to a NAMED module, and student code never does: it is loaded
 * into the unnamed module of its class loader. So the rule is exact — drop the trailing frames that
 * have a module — and Throwable#printStackTrace then produces the per-process text, "... N more"
 * counts included, because those counts are computed from the trimmed arrays.
 */
final class Frames {
  private Frames() {}

  static void trim(Throwable root) {
    Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
    trim(root, seen);
  }

  private static void trim(Throwable t, Set<Throwable> seen) {
    if (t == null || !seen.add(t)) {
      return;
    }
    StackTraceElement[] frames = t.getStackTrace();
    int keep = frames.length;
    if (keep > 0 && isHarness(frames[keep - 1])) {
      while (keep > 0 && frames[keep - 1].getModuleName() != null) {
        keep--;
      }
    }
    if (keep != frames.length) {
      StackTraceElement[] trimmed = new StackTraceElement[keep];
      System.arraycopy(frames, 0, trimmed, 0, keep);
      t.setStackTrace(trimmed);
    }
    trim(t.getCause(), seen);
    for (Throwable s : t.getSuppressed()) {
      trim(s, seen);
    }
  }

  private static boolean isHarness(StackTraceElement frame) {
    return "ptcn.harness".equals(frame.getModuleName());
  }
}
