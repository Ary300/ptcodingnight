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
    this.timeoutMs = Long.parseLong(args[2]) * 1000L;
    this.inputDir = Path.of(args[3]);
    this.outPath = Path.of(args[4]);
    this.errPath = Path.of(args[5]);
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
