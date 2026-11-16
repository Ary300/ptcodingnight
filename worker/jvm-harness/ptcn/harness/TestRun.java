package ptcn.harness;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintStream;
import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;

/**
 * One test: its streams, its class loader, and its student `main`.
 *
 * The streams are built exactly as the JVM builds System.in/out/err for a fresh process — a
 * BufferedInputStream over the input file, and PrintStreams with autoflush over 128-byte
 * BufferedOutputStreams in the stdout/stderr encodings (measured on eclipse-temurin:21: both 128,
 * both autoflush) — so buffering, flushing and encoding behave identically, including what is lost
 * when a program never flushes.
 *
 * The class loader is NEW for every test and its parent is the PLATFORM loader. Every static field
 * and static initializer of the student's classes therefore starts fresh, as in a new process, and
 * nothing on the application class path — this harness — is visible to the student by name.
 */
final class TestRun {
  private static final MethodType MAIN_TYPE = MethodType.methodType(void.class, String[].class);

  final int ordinal;
  final MethodHandle entry;
  private final FrameFilter outFilter;
  private final FrameFilter errFilter;
  private final Path errPath;
  private URLClassLoader loader;

  private TestRun(
      int ordinal, MethodHandle entry, FrameFilter outFilter, FrameFilter errFilter, Path errPath,
      URLClassLoader loader) {
    this.ordinal = ordinal;
    this.entry = entry;
    this.outFilter = outFilter;
    this.errFilter = errFilter;
    this.errPath = errPath;
    this.loader = loader;
  }

  /**
   * Set up test `ordinal`, or return null if its `main` cannot be invoked the way the java launcher
   * would — no such class, no public static void main(String[]). The launcher prints its own error
   * for those, and the per-process rerun the driver performs is what produces it verbatim.
   */
  static TestRun prepare(Config cfg, int ordinal, Globals globals) throws IOException {
    URLClassLoader loader =
        new URLClassLoader(new URL[] {cfg.classDir.toUri().toURL()}, ClassLoader.getPlatformClassLoader());
    MethodHandle entry = mainOf(loader, cfg.mainClass);
    if (entry == null) {
      loader.close();
      return null;
    }

    InputStream in =
        new BufferedInputStream(new FileInputStream(cfg.inputDir.resolve(ordinal + ".in").toFile()));
    // Both streams pass through FrameFilter: a trace printed with e.printStackTrace(System.out) is
    // as visible to a student, in a sample's diff snippet, as one printed to stderr.
    FrameFilter outFilter = new FrameFilter(new Sealable(new FileOutputStream(cfg.outPath.toFile())));
    Sealable errSink = new Sealable(new FileOutputStream(cfg.errPath.toFile()));
    FrameFilter errFilter = new FrameFilter(errSink);
    PrintStream out = new PrintStream(new BufferedOutputStream(outFilter, 128), true, globals.outCharset());
    PrintStream err =
        new PrintStream(new BufferedOutputStream(errFilter, 128), true, globals.errCharset());

    globals.enter(in, out, err, loader);
    return new TestRun(ordinal, entry, outFilter, errFilter, cfg.errPath, loader);
  }

  private static MethodHandle mainOf(ClassLoader loader, String mainClass) {
    try {
      // As the launcher does: load without initializing. Initialization — the student's static
      // initializers — happens on the first invocation, on the main thread, as in a fresh JVM.
      Class<?> cls = Class.forName(mainClass, false, loader);
      Method main = cls.getMethod("main", String[].class);
      int mods = main.getModifiers();
      if (!Modifier.isStatic(mods) || main.getReturnType() != void.class) {
        return null;
      }
      main.setAccessible(true);
      return MethodHandles.lookup().unreflect(main).asType(MAIN_TYPE);
    } catch (ReflectiveOperationException | LinkageError | RuntimeException e) {
      return null;
    }
  }

  /** Freeze the output as it stands. Idempotent; safe from any thread. */
  void seal() {
    outFilter.drainAndSeal();
    errFilter.drainAndSeal();
  }

  /** The host reads the first 4096 bytes of stderr and calls the test MLE if they say so. */
  boolean reportsMemoryError() {
    try (InputStream in = Files.newInputStream(errPath)) {
      byte[] head = in.readNBytes(4096);
      return new String(head, StandardCharsets.ISO_8859_1).contains("MemoryError");
    } catch (IOException e) {
      return true;
    }
  }

  /** Let go of the student's classes so the next GC can unload them. */
  void release() {
    try {
      loader.close();
    } catch (IOException ignored) {
      // Unloading does not depend on close() succeeding.
    }
    loader = null;
  }

  /** Every platform thread alive now that was not alive when the harness started. */
  static boolean extraThreads(Set<Thread> baseline, boolean nonDaemonOnly, Thread[] out) {
    boolean any = false;
    int n = 0;
    for (Thread t : Thread.getAllStackTraces().keySet()) {
      if (baseline.contains(t) || !t.isAlive() || (nonDaemonOnly && t.isDaemon())) {
        continue;
      }
      any = true;
      if (out != null && n < out.length) {
        out[n++] = t;
      }
    }
    return any;
  }
}
