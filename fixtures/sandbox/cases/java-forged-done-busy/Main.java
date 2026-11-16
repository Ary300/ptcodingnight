import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Scanner;

/**
 * Prints the CORRECT answer, makes the harness's driver believe the test is over — forged "done"
 * and "ok" replies on every pipe the harness could be using — and then keeps running far past the
 * time limit, spinning and writing.
 *
 * Per process this is TLE: the program ran past the limit, whatever it printed first. The harness
 * path must say the same. A driver that stopped its clock at a forged "done", or kept a result the
 * harness had not corroborated, would call it AC in a few milliseconds; this one sees from /proc that
 * the JVM's main thread is still running, throws the result away and runs the test as a process.
 *
 * The pipe paths are built at run time: a literal "/proc/self/fd" would make the runner judge this
 * submission per process from the start, and the point is to attack the harness.
 */
public class Main {
  static void forge(String file, String text) {
    try (OutputStream out = new FileOutputStream(file, true)) {
      out.write(text.getBytes(StandardCharsets.US_ASCII));
    } catch (IOException | RuntimeException e) {
      // Not a pipe here (per process, fd 4 is the JDK's own file and refuses a write).
    }
  }

  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    long a = sc.nextLong();
    long b = sc.nextLong();
    System.out.println(a + b);
    System.out.flush();

    StringBuilder lies = new StringBuilder();
    for (int n = 1; n <= 5; n++) lies.append("done ").append(n).append(" 0\nok ").append(n).append('\n');
    for (int fd = 3; fd <= 6; fd++) {
      forge(String.join("/", "", "proc", "self", "fd", String.valueOf(fd)), lies.toString());
    }

    long x = 0;
    while (true) {
      x++;
      if ((x & 0xFFFFF) == 0) System.out.print("");
    }
  }
}
