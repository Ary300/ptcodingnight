package ptcn.harness;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * The harness's half of the driver handshake: commands in on fd 3, replies out on fd 4.
 *
 * fd 0, 1 and 2 of this JVM are /dev/null, never the control channel. Student code that writes to
 * FileDescriptor.out therefore writes nowhere rather than into the protocol (and the runner does
 * not even start the harness for a submission that references FileDescriptor; see
 * worker/jvm-harness-eligibility.ts).
 *
 * Replies are formatted into a preallocated buffer without allocating, because the moments they
 * are sent — a test that just threw OutOfMemoryError, a watchdog firing on a heap-thrashing
 * program — are exactly the moments an allocation may fail.
 *
 * Protocol (one line each):
 *   driver  -> harness   run N | quit
 *   harness -> driver    ready P | done N S | ok N | dirty N | tle N | abort N
 */
final class Control {
  static final byte[] READY = bytes("ready");
  static final byte[] DONE = bytes("done");
  static final byte[] OK = bytes("ok");
  static final byte[] DIRTY = bytes("dirty");
  static final byte[] TLE = bytes("tle");
  static final byte[] ABORT = bytes("abort");

  private final FileInputStream commands;
  private final FileOutputStream replies;
  private final Object writeLock = new Object();
  private final byte[] out = new byte[64];
  private final byte[] digits = new byte[12];

  private Control(FileInputStream commands, FileOutputStream replies) {
    this.commands = commands;
    this.replies = replies;
  }

  static Control open() throws IOException {
    return new Control(
        new FileInputStream("/proc/self/fd/3"), new FileOutputStream("/proc/self/fd/4", true));
  }

  private static byte[] bytes(String s) {
    return s.getBytes(StandardCharsets.US_ASCII);
  }

  /** One reply line: `<verb> <a>` or `<verb> <a> <b>`. A negative `b` is omitted. */
  void send(byte[] verb, int a, int b) {
    synchronized (writeLock) {
      int n = 0;
      System.arraycopy(verb, 0, out, 0, verb.length);
      n += verb.length;
      out[n++] = ' ';
      n = appendInt(n, a);
      if (b >= 0) {
        out[n++] = ' ';
        n = appendInt(n, b);
      }
      out[n++] = '\n';
      try {
        replies.write(out, 0, n);
      } catch (IOException ignored) {
        // The driver is gone or killing us. Nothing to report it to.
      }
    }
  }

  private int appendInt(int at, int value) {
    int v = Math.max(0, value);
    int len = 0;
    do {
      digits[len++] = (byte) ('0' + v % 10);
      v /= 10;
    } while (v > 0);
    int n = at;
    while (len > 0) {
      out[n++] = digits[--len];
    }
    return n;
  }

  /** The next command line, without its newline; null at end of input. */
  String readLine() throws IOException {
    StringBuilder line = new StringBuilder(16);
    for (;;) {
      int b = commands.read();
      if (b < 0) {
        return line.length() == 0 ? null : line.toString();
      }
      if (b == '\n') {
        return line.toString();
      }
      if (line.length() < 64) {
        line.append((char) b);
      }
    }
  }
}
