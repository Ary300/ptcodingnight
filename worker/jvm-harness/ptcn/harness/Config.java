package ptcn.harness;

import java.nio.file.Path;

/** The harness's arguments, written by the runner into /in/harness.sh. */
final class Config {
  final Path classDir;
  final String mainClass;
  final long timeoutMs;
  final Path inputDir;
  final Path outPath;
  final Path errPath;

  private Config(String[] args) {
    this.classDir = Path.of(args[0]);
    this.mainClass = args[1];
    // Seconds, possibly with a fraction: the runner kills a test at its TLE threshold plus a
    // margin, to the millisecond (worker/runner.ts, TLE_KILL_MARGIN_MS).
    this.timeoutMs = parseSeconds(args[2]);
    this.inputDir = Path.of(args[3]);
    this.outPath = Path.of(args[4]);
    this.errPath = Path.of(args[5]);
  }

  private static long parseSeconds(String text) {
    if (!text.matches("[0-9]{1,6}(\\.[0-9]{1,3})?")) {
      throw new IllegalArgumentException("timeout must be seconds with at most three decimals");
    }
    return new java.math.BigDecimal(text).movePointRight(3).longValueExact();
  }

  /** `<classDir> <mainClass> <timeoutSeconds> <inputDir> <stdoutFile> <stderrFile>` */
  static Config parse(String[] args) {
    if (args.length != 6) {
      throw new IllegalArgumentException("expected 6 arguments, got " + args.length);
    }
    Config cfg = new Config(args);
    if (cfg.timeoutMs <= 0) {
      throw new IllegalArgumentException("timeout must be positive");
    }
    return cfg;
  }
}
