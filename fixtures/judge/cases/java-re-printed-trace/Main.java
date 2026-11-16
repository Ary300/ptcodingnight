// Prints a stack trace with a cause itself, then exits 2. The text a student sees for a runtime
// error must not show any frame below their own main.
public class Main {
  public static void main(String[] args) {
    java.util.Scanner in = new java.util.Scanner(System.in);
    long a = in.nextLong(), b = in.nextLong();
    if (a + b == 0) {
      new RuntimeException("outer", new RuntimeException("inner")).printStackTrace();
      System.exit(2);
    }
    System.out.println(a + b);
  }
}
