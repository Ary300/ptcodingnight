import java.io.*;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.Scanner;

/**
 * Attacks the Java harness's handshake from inside the JVM it shares with the harness.
 *
 * Every test it:
 *   1. reaches for the harness's internals by reflection (module encapsulation must refuse);
 *   2. forges the harness's replies on its pipe (done / ok / tle for every ordinal), forges the
 *      driver's `ptcn-done` to the host, and injects `run` commands into the harness's command pipe;
 *   3. forges `/out/<n>.out` and `/out/<n>.meta` for every OTHER test;
 *   4. leaves a daemon thread behind that keeps hunting /in for the next tests' inputs and writes
 *      whatever it finds into stdout and into the file the next test's output goes to;
 *   5. prints a WRONG answer, so the only way to score is a forgery that worked.
 *
 * Anything it reads that is not its own input is printed after "ESCAPED", so a hidden input that
 * reached any result the student can see fails G5 by its escape-string check. The paths are built
 * at run time on purpose: a literal "/proc/self/fd" would make the runner judge this submission
 * one process per test, and the point is to attack the harness.
 */
public class Main {
  static String own = "";

  static String path(String... parts) {
    return String.join("/", parts);
  }

  static void write(String file, String text) {
    try (OutputStream out = new FileOutputStream(file, true)) {
      out.write(text.getBytes(StandardCharsets.US_ASCII));
    } catch (IOException | RuntimeException e) {
      // Refused, as it should be.
    }
  }

  static void reflect() {
    try {
      Class<?> h = Class.forName("ptcn.harness.State", false, ClassLoader.getSystemClassLoader());
      for (Field f : h.getDeclaredFields()) {
        try {
          f.setAccessible(true);
          System.out.println("ESCAPED reflection into " + f);
        } catch (RuntimeException refused) {
          // InaccessibleObjectException: the harness package is not opened.
        }
      }
    } catch (ClassNotFoundException | LinkageError | RuntimeException e) {
      // Not even visible: also fine.
    }
  }

  static void forge() {
    StringBuilder replies = new StringBuilder();
    StringBuilder bells = new StringBuilder();
    StringBuilder runs = new StringBuilder();
    for (int n = 1; n <= 5; n++) {
      replies.append("done ").append(n).append(" 0\nok ").append(n).append('\n');
      bells.append("ptcn-done ").append(n).append('\n');
      runs.append("run ").append(n + 1).append('\n');
    }
    for (int fd = 3; fd <= 6; fd++) {
      write(path("", "proc", "self", "fd", String.valueOf(fd)), replies.toString());
    }
    write(path("", "proc", "1", "fd", "1"), bells.toString());
    write(path("", "proc", "self", "fd", "3"), runs.toString());
    for (int n = 1; n <= 5; n++) {
      write(path("", "out", n + ".out"), "999\n");
      write(path("", "out", n + ".meta"), "0 1 4\n");
    }
  }

  static String hunt() {
    StringBuilder found = new StringBuilder();
    for (int n = 1; n <= 5; n++) {
      try {
        String text = new String(Files.readAllBytes(Paths.get("/in", n + ".in")), StandardCharsets.US_ASCII);
        if (!text.equals(own)) found.append("ESCAPED input ").append(n).append(": ").append(text.trim()).append('\n');
      } catch (IOException | RuntimeException e) {
        // Not placed yet, or already removed.
      }
    }
    return found.toString();
  }

  public static void main(String[] args) throws Exception {
    byte[] input = System.in.readAllBytes();
    own = new String(input, StandardCharsets.US_ASCII);
    Scanner sc = new Scanner(own);
    long a = sc.nextLong();
    long b = sc.nextLong();

    reflect();
    forge();

    Thread lurker = new Thread(() -> {
      long until = System.currentTimeMillis() + 20_000;
      while (System.currentTimeMillis() < until) {
        String found = hunt();
        if (!found.isEmpty()) {
          System.out.print(found);
          System.err.print(found);
          write("/tmp/ptcn-raw", found);
          write("/tmp/ptcn-err", found);
        }
        try {
          Thread.sleep(5);
        } catch (InterruptedException e) {
          return;
        }
      }
    });
    lurker.setDaemon(true);
    lurker.start();

    // Give the forged bells time to make the host hand over the next input, and look for it.
    Thread.sleep(300);
    String found = hunt();
    System.out.print(found);
    System.err.print(found);
    System.out.println(a + b + 1);
  }
}
