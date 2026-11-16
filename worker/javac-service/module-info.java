/**
 * A warm Java compiler: one JVM that compiles submission after submission through javac's own
 * command-line entry point, so the JVM's start and javac's warm-up are paid once per worker instead
 * of once per submission. See worker/javac-service.ts.
 */
module ptcn.javacsvc {
  requires jdk.compiler;
}
