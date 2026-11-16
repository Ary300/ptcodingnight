/**
 * The in-JVM test harness for the Java judge runtime.
 *
 * A NAMED module on purpose. Its package is neither exported nor opened, so student code — which
 * lives in the unnamed module of a separate class loader whose parent is the platform loader —
 * cannot name, call, or reflect into anything here. `setAccessible` on a member of a package that
 * is not opened fails with InaccessibleObjectException regardless of any SecurityManager.
 *
 * That is a correctness fence, not the security boundary. The security argument does not rest on
 * the harness being tamper-proof (sun.misc.Unsafe exists); see worker/jvm-driver.ts.
 */
module ptcn.harness {
}
