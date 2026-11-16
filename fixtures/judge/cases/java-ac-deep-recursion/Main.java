// 5,000 frames deep on the main thread, as a recursive DFS would go.
//
// It was 20,000, and that failed G4 as RE on the PER-PROCESS path under a busy host: how deep a
// fresh JVM can recurse depends on how soon the JIT compiles the method, and with the CPU contended
// every frame can stay interpreted. Measured on eclipse-temurin:21 (arm64, 2 MB default stack) the
// all-interpreted floor is 15,490 frames for this method, and an x86-64 host's 1 MB default stack
// halves that. 5,000 sits under the floor on both, so the fixture tests deep recursion and not the
// scheduler.
public class Main {
  static long down(long n, long acc) {
    return n == 0 ? acc : down(n - 1, acc + 1);
  }

  public static void main(String[] args) {
    java.util.Scanner in = new java.util.Scanner(System.in);
    long a = in.nextLong(), b = in.nextLong();
    System.out.println(a + b + down(5000, 0) - 5000);
  }
}
