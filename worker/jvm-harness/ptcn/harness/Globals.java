package ptcn.harness;

import java.io.InputStream;
import java.io.PrintStream;
import java.lang.reflect.Field;
import java.nio.charset.Charset;
import java.util.Locale;
import java.util.Properties;
import java.util.TimeZone;

/**
 * The JVM-wide state a fresh `java` process starts with, captured once and put back after every
 * test.
 *
 * A fresh class loader resets the student's own statics. These are the things a program can change
 * that live OUTSIDE its classes and would otherwise carry into the next test: the three standard
 * streams, system properties, the default locale and time zone, the default uncaught-exception
 * handler, and the main thread's own name, priority, handler, context loader, interrupt flag and
 * thread-locals.
 *
 * The thread-local maps are cleared by reflection, which is why the harness runs with
 * `--add-opens java.base/java.lang=ptcn.harness`. That opens java.lang to THIS module only; student
 * code in the unnamed module gains nothing from it.
 */
final class Globals {
  private final Thread mainThread;
  private final InputStream idleIn;
  private final PrintStream idleOut;
  private final PrintStream idleErr;
  private final Charset outCharset;
  private final Charset errCharset;
  private final Properties properties;
  private final Locale locale;
  private final Locale displayLocale;
  private final Locale formatLocale;
  private final TimeZone timeZone;
  private final ClassLoader contextLoader;
  private final Field threadLocals;
  private final Field inheritableThreadLocals;

  private Globals(Thread mainThread) throws ReflectiveOperationException {
    this.mainThread = mainThread;
    this.idleIn = System.in;
    this.idleOut = System.out;
    this.idleErr = System.err;
    // The JVM picked these from stdout.encoding / stderr.encoding when it built System.out and
    // System.err; the per-test streams use the very same, as a fresh process would.
    this.outCharset = System.out.charset();
    this.errCharset = System.err.charset();
    this.properties = (Properties) System.getProperties().clone();
    this.locale = Locale.getDefault();
    this.displayLocale = Locale.getDefault(Locale.Category.DISPLAY);
    this.formatLocale = Locale.getDefault(Locale.Category.FORMAT);
    this.timeZone = TimeZone.getDefault();
    this.contextLoader = mainThread.getContextClassLoader();
    this.threadLocals = Thread.class.getDeclaredField("threadLocals");
    this.inheritableThreadLocals = Thread.class.getDeclaredField("inheritableThreadLocals");
    this.threadLocals.setAccessible(true);
    this.inheritableThreadLocals.setAccessible(true);
  }

  static Globals capture(Thread mainThread) throws ReflectiveOperationException {
    return new Globals(mainThread);
  }

  Charset outCharset() {
    return outCharset;
  }

  Charset errCharset() {
    return errCharset;
  }

  /** Install one test's streams and loader, on a main thread that looks freshly started. */
  void enter(InputStream in, PrintStream out, PrintStream err, ClassLoader loader) {
    resetMainThread();
    mainThread.setContextClassLoader(loader);
    System.setIn(in);
    System.setOut(out);
    System.setErr(err);
  }

  /** Put back everything a test may have changed. */
  void restore() {
    System.setIn(idleIn);
    System.setOut(idleOut);
    System.setErr(idleErr);
    Thread.setDefaultUncaughtExceptionHandler(null);
    if (!System.getProperties().equals(properties)) {
      Properties current = System.getProperties();
      current.clear();
      current.putAll(properties);
    }
    if (!locale.equals(Locale.getDefault())) {
      Locale.setDefault(locale);
    }
    if (!displayLocale.equals(Locale.getDefault(Locale.Category.DISPLAY))) {
      Locale.setDefault(Locale.Category.DISPLAY, displayLocale);
    }
    if (!formatLocale.equals(Locale.getDefault(Locale.Category.FORMAT))) {
      Locale.setDefault(Locale.Category.FORMAT, formatLocale);
    }
    if (!timeZone.hasSameRules(TimeZone.getDefault())
        || !timeZone.getID().equals(TimeZone.getDefault().getID())) {
      TimeZone.setDefault(timeZone);
    }
    resetMainThread();
    mainThread.setContextClassLoader(contextLoader);
  }

  private void resetMainThread() {
    Thread.interrupted();
    mainThread.setName("main");
    mainThread.setPriority(Thread.NORM_PRIORITY);
    mainThread.setUncaughtExceptionHandler(null);
    try {
      threadLocals.set(mainThread, null);
      inheritableThreadLocals.set(mainThread, null);
    } catch (IllegalAccessException e) {
      throw new IllegalStateException("thread-locals not reachable", e);
    }
  }
}
