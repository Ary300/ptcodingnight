import java.util.*;

// The useLegacyMergeSort property is read once per JVM. The harness declines this submission and
// it runs as one process per test, as before.
public class Main {
  public static void main(String[] args) {
    System.setProperty("java.util.Arrays.useLegacyMergeSort", "true");
    java.util.Scanner in = new java.util.Scanner(System.in);
    long a = in.nextLong(), b = in.nextLong();
    Long[] v = {a, b};
    Arrays.sort(v, (x, y) -> Long.compare(x, y));
    System.out.println(v[0] + v[1]);
  }
}
