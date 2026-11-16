package ptcn.javac;

import java.io.BufferedReader;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Compiles one submission at a time, for as long as its container lives.
 *
 * Each request runs javac through `com.sun.tools.javac.Main.compile` — the same entry point the
 * `javac` launcher calls — with the same arguments the registry gives the per-submission compile
 * container, against a source at the same path, `/work/Main.java`, in an empty `/work`, writing to
 * an empty `/build`. So the option parsing, the class files, the diagnostics (paths and line
 * numbers included) and the exit status are javac's own, produced the way they always were. Only
 * the JVM is warm.
 *
 * `/work` and `/build` are this container's own tmpfs, emptied before every compile, so nothing of
 * one submission is visible to the next. The submission's source arrives through `/jobs/<id>/`,
 * a directory that holds nothing else of it — never an input, never an expected output — and its
 * class files and javac's messages go back the same way.
 *
 * No student code runs here: `-proc:none` is required of every request (annotation processing is
 * the only way javac executes code it is compiling), and the arguments come from the worker, which
 * reads them from the registry; nothing in a submission can add an option, a classpath or a
 * plugin.
 *
 * Protocol, one line each, on stdin and stdout:
 *   worker  -> service   compile <id> <javac argument> ...
 *   service -> worker    ready | done <id> <javac exit status>
 */
public final class Service {
  private static final Pattern JOB_ID = Pattern.compile("[a-z0-9][a-z0-9-]{0,80}");
  private static final Path WORK = Path.of("/work");
  private static final Path BUILD = Path.of("/build");
  private static final Path JOBS = Path.of("/jobs");
  private static final String SOURCE = "/work/Main.java";

  private Service() {}

  public static void main(String[] args) throws IOException {
    PrintStream replies = new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.US_ASCII);
    // javac's own messages never go to the real stdout or stderr; they are captured per compile.
    System.setOut(new PrintStream(PrintStream.nullOutputStream()));
    System.setErr(new PrintStream(PrintStream.nullOutputStream()));
    Charset stderrCharset = Charset.forName(System.getProperty("stderr.encoding", "UTF-8"), StandardCharsets.UTF_8);

    BufferedReader requests = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.US_ASCII));
    replies.println("ready");
    for (String line; (line = requests.readLine()) != null; ) {
      List<String> words = Arrays.asList(line.trim().split(" "));
      if (words.size() < 3 || !words.get(0).equals("compile") || !JOB_ID.matcher(words.get(1)).matches()) {
        replies.println("refused");
        continue;
      }
      String id = words.get(1);
      String[] javacArgs = words.subList(2, words.size()).toArray(new String[0]);
      if (!List.of(javacArgs).contains("-proc:none") || !List.of(javacArgs).get(javacArgs.length - 1).equals(SOURCE)) {
        replies.println("refused " + id);
        continue;
      }
      try {
        replies.println("done " + id + " " + compile(JOBS.resolve(id), javacArgs, stderrCharset));
      } catch (IOException | RuntimeException e) {
        // The worker compiles this submission in its own container instead. The class of the
        // failure is all that is said: it is for the worker's log, and carries no submission text.
        replies.println("failed " + id + " " + e.getClass().getName());
      }
    }
  }

  private static int compile(Path job, String[] javacArgs, Charset stderrCharset) throws IOException {
    empty(WORK);
    empty(BUILD);
    Files.copy(job.resolve("Main.java"), WORK.resolve("Main.java"));

    StringWriter messages = new StringWriter();
    int status;
    try (PrintWriter out = new PrintWriter(messages)) {
      status = com.sun.tools.javac.Main.compile(javacArgs, out);
    }
    // Bytes as the launcher would have written them to stderr.
    Files.write(job.resolve("stderr"), messages.toString().getBytes(stderrCharset));

    Path classes = job.resolve("build");
    try (Stream<Path> files = Files.walk(BUILD)) {
      for (Path file : (Iterable<Path>) files::iterator) {
        Path target = classes.resolve(BUILD.relativize(file).toString());
        if (Files.isDirectory(file)) {
          Files.createDirectories(target);
        } else {
          Files.copy(file, target, StandardCopyOption.REPLACE_EXISTING);
        }
      }
    }
    return status;
  }

  private static void empty(Path dir) throws IOException {
    try (Stream<Path> files = Files.walk(dir)) {
      for (Path file : (Iterable<Path>) files.sorted(Comparator.reverseOrder())::iterator) {
        if (!file.equals(dir)) {
          Files.delete(file);
        }
      }
    }
  }
}
