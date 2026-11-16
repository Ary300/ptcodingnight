package ptcn.harness;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Removes the frames beneath the student's code from stack traces a student prints to stderr.
 *
 * The uncaught case is trimmed structurally on the Throwable (Frames#trim). This handles the traces
 * a program prints itself — `e.printStackTrace()` in a catch block is common, and stderr is what a
 * student sees for a runtime error on a sample. Per process, the bottom frame of such a trace is the
 * student's own; here the harness's StudentMain.run and Thread.run sit beneath it, and beneath a
 * static initializer the method-handle machinery too. Same rule as Frames: the trailing run of frames from
 * NAMED modules is dropped when the harness frame is in it. Student frames never name a module.
 *
 * It also corrects the "... N more" line: N counts the frames a cause shares with the trace that
 * encloses it, and the dropped run is part of that shared suffix. Throwable#printStackTrace writes a
 * block's frames one tab deeper than its caption; a "Caused by" shares its encloser's prefix, a
 * "Suppressed" is one tab deeper than its encloser. That is all the structure needed.
 *
 * Line-buffered with bounded memory. A line too long to be a frame passes straight through, and
 * bytes are never reordered: the only lines held back are frame lines, until the run they belong to
 * is known to be the harness's or not.
 */
final class FrameFilter extends OutputStream {
  private static final byte[] AT = "at ".getBytes(StandardCharsets.US_ASCII);
  private static final byte[] HARNESS = "at ptcn.harness".getBytes(StandardCharsets.US_ASCII);
  private static final byte[] MORE_HEAD = "... ".getBytes(StandardCharsets.US_ASCII);
  private static final byte[] MORE_TAIL = " more".getBytes(StandardCharsets.US_ASCII);
  private static final byte[] CAUSED = "Caused by: ".getBytes(StandardCharsets.US_ASCII);
  private static final byte[] SUPPRESSED = "Suppressed: ".getBytes(StandardCharsets.US_ASCII);
  private static final int MAX_DEPTH = 32;
  private static final int MAX_LINE = 4096;
  /** A run of module frames longer than this is passed through; the harness's is a handful. */
  private static final int MAX_HELD = 64 * 1024;

  private final Sealable sink;
  private final byte[] line = new byte[MAX_LINE];
  private int len;
  private boolean passing;

  /** Module frames held back, all at `heldTabs`, ending in a newline each. */
  private final byte[] held = new byte[MAX_HELD];
  private int heldLen;
  private int heldCount;
  private int heldTabs;
  private boolean heldHasHarness;

  /** Per caption depth: frames dropped from the bottom of the most recent block at that depth. */
  private final int[] dropped = new int[MAX_DEPTH];
  /** Per caption depth: frames dropped from the bottom of that block's encloser. */
  private final int[] enclosingDropped = new int[MAX_DEPTH];
  /** Any frame has been dropped since the last reset: a plain line of output resets nothing. */
  private boolean anyDropped;

  /**
   * Output accepted during one write call, handed to the file in ONE write when the call ends. The
   * per-process JVM writes a large print with one syscall; writing it here a line at a time costs a
   * syscall per line, which on a 200,000-line answer is real time charged to the student.
   */
  private final byte[] pending = new byte[64 * 1024];
  private int pendingLen;

  FrameFilter(Sealable sink) {
    this.sink = sink;
  }

  @Override
  public synchronized void write(int b) throws IOException {
    try {
      accept((byte) b);
    } finally {
      flushPending();
    }
  }

  private void emit(byte[] b, int off, int n) throws IOException {
    if (n > pending.length - pendingLen) {
      flushPending();
    }
    if (n >= pending.length) {
      sink.write(b, off, n);
      return;
    }
    System.arraycopy(b, off, pending, pendingLen, n);
    pendingLen += n;
  }

  private void emit(byte b) throws IOException {
    if (pendingLen == pending.length) {
      flushPending();
    }
    pending[pendingLen++] = b;
  }

  private void flushPending() throws IOException {
    if (pendingLen == 0) {
      return;
    }
    int n = pendingLen;
    pendingLen = 0;
    sink.write(pending, 0, n);
  }

  @Override
  public synchronized void write(byte[] b, int off, int n) throws IOException {
    try {
      writeAll(b, off, n);
    } finally {
      flushPending();
    }
  }

  private void writeAll(byte[] b, int off, int n) throws IOException {
    int i = off;
    int end = off + n;
    while (i < end) {
      if (passing) {
        // A line too long to be a frame goes out a chunk at a time, never a byte at a time:
        // per-byte writes turned a correct program's multi-megabyte line into a TLE.
        int stop = i;
        while (stop < end && b[stop] != '\n') {
          stop++;
        }
        if (stop < end) {
          stop++;
          passing = false;
        }
        emit(b, i, stop - i);
        i = stop;
      } else {
        accept(b[i++]);
      }
    }
  }

  private void accept(byte b) throws IOException {
    if (passing) {
      emit(b);
      if (b == '\n') {
        passing = false;
      }
      return;
    }
    line[len++] = b;
    if (b == '\n') {
      onLine();
      len = 0;
    } else if (len == MAX_LINE) {
      releaseHeld();
      emit(line, 0, len);
      len = 0;
      passing = true;
    }
  }

  /** What is buffered is real output: hand it on, then close the file. */
  synchronized void drainAndSeal() {
    try {
      endRun();
      if (len > 0) {
        emit(line, 0, len);
      }
      flushPending();
    } catch (IOException ignored) {
      // Same as a failed write on the per-process path: the bytes are gone.
    }
    len = 0;
    sink.seal();
  }

  private void onLine() throws IOException {
    int tabs = 0;
    while (tabs < len && line[tabs] == '\t') {
      tabs++;
    }
    if (tabs > 0 && tabs <= MAX_DEPTH && isModuleFrame(tabs)) {
      if (heldCount > 0 && heldTabs != tabs) {
        endRun();
      }
      hold(tabs);
      return;
    }
    endRun();

    if (tabs > 0 && tabs <= MAX_DEPTH && startsWith(tabs, MORE_HEAD)) {
      int count = moreCount(tabs + MORE_HEAD.length);
      int shared = enclosingDropped[tabs - 1];
      if (count > 0 && shared > 0) {
        // The shared suffix includes the dropped frames, so this block's trace ends in them too,
        // folded into the count rather than printed. A cause of THIS block needs to know.
        dropped[tabs - 1] = Math.min(count, shared);
        writeMore(tabs, count - Math.min(count, shared));
        return;
      }
    } else if (tabs < MAX_DEPTH && startsWith(tabs, CAUSED)) {
      enclosingDropped[tabs] = dropped[tabs];
      dropped[tabs] = 0;
    } else if (tabs > 0 && tabs < MAX_DEPTH && startsWith(tabs, SUPPRESSED)) {
      enclosingDropped[tabs] = dropped[tabs - 1];
      dropped[tabs] = 0;
    } else if (tabs == 0) {
      // A line at the left margin that is no caption starts a new trace, or is not a trace.
      if (anyDropped) {
        Arrays.fill(dropped, 0);
        Arrays.fill(enclosingDropped, 0);
        anyDropped = false;
      }
    }
    emit(line, 0, len);
  }

  /** `at <module>/...` — a frame whose class is in a named module. Student frames have no `/`. */
  private boolean isModuleFrame(int tabs) {
    if (!startsWith(tabs, AT)) {
      return false;
    }
    for (int i = tabs + AT.length; i < len; i++) {
      byte c = line[i];
      if (c == '/') {
        return true;
      }
      if (c == '(' || c == ' ') {
        return false;
      }
    }
    return false;
  }

  private void hold(int tabs) throws IOException {
    if (heldLen + len > MAX_HELD) {
      releaseHeld();
    }
    if (heldCount == 0) {
      heldTabs = tabs;
    }
    System.arraycopy(line, 0, held, heldLen, len);
    heldLen += len;
    heldCount++;
    heldHasHarness |= startsWith(tabs, HARNESS) && isHarnessEnd(tabs + HARNESS.length);
  }

  /** The run of module frames is over. Drop it if it was the harness's, otherwise print it. */
  private void endRun() throws IOException {
    if (heldCount == 0) {
      return;
    }
    if (heldHasHarness) {
      dropped[heldTabs - 1] = heldCount;
      anyDropped = true;
    } else {
      emit(held, 0, heldLen);
    }
    heldLen = 0;
    heldCount = 0;
    heldHasHarness = false;
  }

  private void releaseHeld() throws IOException {
    if (heldCount > 0) {
      emit(held, 0, heldLen);
    }
    heldLen = 0;
    heldCount = 0;
    heldHasHarness = false;
  }

  private boolean isHarnessEnd(int at) {
    return at < len && (line[at] == '/' || line[at] == '@');
  }

  private boolean startsWith(int at, byte[] prefix) {
    if (at + prefix.length > len) {
      return false;
    }
    for (int i = 0; i < prefix.length; i++) {
      if (line[at + i] != prefix[i]) {
        return false;
      }
    }
    return true;
  }

  /** The N of "... N more\n" starting at `at`, or -1 if the line is anything else. */
  private int moreCount(int at) {
    int i = at;
    int value = 0;
    int digitCount = 0;
    while (i < len && line[i] >= '0' && line[i] <= '9' && digitCount < 9) {
      value = value * 10 + (line[i] - '0');
      i++;
      digitCount++;
    }
    if (digitCount == 0 || !startsWith(i, MORE_TAIL)) {
      return -1;
    }
    int end = i + MORE_TAIL.length;
    boolean lineEnds = end == len - 1 || (end == len - 2 && line[len - 2] == '\r');
    return lineEnds ? value : -1;
  }

  private void writeMore(int tabs, int count) throws IOException {
    if (count == 0) {
      return;
    }
    String eol = len >= 2 && line[len - 2] == '\r' ? "\r\n" : "\n";
    byte[] text = ("\t".repeat(tabs) + "... " + count + " more" + eol).getBytes(StandardCharsets.US_ASCII);
    emit(text, 0, text.length);
  }
}
