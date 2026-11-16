// An uncaught exception with a cause, thrown from a helper, on the third test.
public class Main {
  static long check(long s) {
    if (s == 0) throw new IllegalStateException("zero", new ArithmeticException("inner"));
    return s;
  }

  public static void main(String[] args) {
    java.util.Scanner in = new java.util.Scanner(System.in);
    long a = in.nextLong(), b = in.nextLong();
    System.out.println(check(a + b));
  }
}
