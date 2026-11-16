// Holds ~200 MB in a static field in EVERY test, under a 512 MB container (heap ~384 MB, old
// generation ~256 MB under SerialGC). If one test's array outlived it, the next would not fit.
public class Main {
  static byte[] big;

  public static void main(String[] args) {
    java.util.Scanner in = new java.util.Scanner(System.in);
    long a = in.nextLong(), b = in.nextLong();
    big = new byte[200 * 1024 * 1024];
    for (int i = 0; i < big.length; i += 4096) big[i] = 1;
    System.out.println(a + b + big[0] - 1);
  }
}
