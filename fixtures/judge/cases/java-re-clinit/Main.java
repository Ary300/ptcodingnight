import java.util.*;

// The static initializer reads the input and divides by the answer, which is 0 on the third test:
// ExceptionInInitializerError, reported exactly as a fresh JVM reports it.
public class Main {
  static Scanner in = new Scanner(System.in);
  static long a = in.nextLong(), b = in.nextLong();
  static long check = 100 / (a + b);

  public static void main(String[] args) {
    System.out.println(a + b);
  }
}
