// The content problems' 256 MB limit: heap ~192 MB, old generation ~128 MB. Holds 96 MB in
// every test.
public class Main {
  static byte[] big;

  public static void main(String[] args) {
    java.util.Scanner in = new java.util.Scanner(System.in);
    long a = in.nextLong(), b = in.nextLong();
    big = new byte[96 * 1024 * 1024];
    for (int i = 0; i < big.length; i += 4096) big[i] = 1;
    System.out.println(a + b + big[0] - 1);
  }
}
