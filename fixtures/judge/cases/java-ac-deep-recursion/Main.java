// 20,000 frames deep on the main thread, as a recursive DFS would go.
public class Main {
  static long down(long n, long acc) {
    return n == 0 ? acc : down(n - 1, acc + 1);
  }

  public static void main(String[] args) {
    java.util.Scanner in = new java.util.Scanner(System.in);
    long a = in.nextLong(), b = in.nextLong();
    System.out.println(a + b + down(20000, 0) - 20000);
  }
}
