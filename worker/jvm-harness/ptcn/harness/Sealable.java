package ptcn.harness;

import java.io.IOException;
import java.io.OutputStream;

/**
 * The bottom of a test's stdout or stderr: the file the driver copies out, behind a switch.
 *
 * Once sealed, every write is dropped and the file is closed. That is how the end of a test is
 * made final: a thread still holding this test's System.out (a daemon the program left running, or
 * the student's own code after a swallowed exit) can no longer change the bytes the driver is about
 * to copy, and it can never reach the NEXT test's file, which is a different stream object.
 *
 * Sealing does NOT flush what sits above it. Measured on the per-process path: a byte written
 * with `System.out.write(int)` and never followed by a newline or flush is lost when the JVM ends,
 * by return, exit, halt or exception alike. Flushing here would print it, and change the output.
 *
 * Write failures pass through as IOException. PrintStream swallows them, exactly as it swallows
 * ENOSPC when the per-process program floods the same tmpfs file.
 */
final class Sealable extends OutputStream {
  private final OutputStream file;
  private final Object lock = new Object();
  private boolean sealed;

  Sealable(OutputStream file) {
    this.file = file;
  }

  @Override
  public void write(int b) throws IOException {
    synchronized (lock) {
      if (!sealed) {
        file.write(b);
      }
    }
  }

  @Override
  public void write(byte[] b, int off, int len) throws IOException {
    synchronized (lock) {
      if (!sealed) {
        file.write(b, off, len);
      }
    }
  }

  @Override
  public void flush() throws IOException {
    synchronized (lock) {
      if (!sealed) {
        file.flush();
      }
    }
  }

  /** A student's close() of System.out closes the file, as closing fd 1 would. */
  @Override
  public void close() throws IOException {
    seal();
  }

  void seal() {
    synchronized (lock) {
      if (sealed) {
        return;
      }
      sealed = true;
      try {
        file.close();
      } catch (IOException ignored) {
        // Nothing more can be written either way.
      }
    }
  }
}
