import java.util.*;

// Correct on the first two tests; exhausts the heap on the third.
public class Main {
  public static void main(String[] args) {
    java.util.Scanner in = new java.util.Scanner(System.in);
    long a = in.nextLong(), b = in.nextLong();
    List<long[]> held = new ArrayList<>();
    while (a + b == 0) held.add(new long[8 * 1024 * 1024]);
    System.out.println(a + b);
  }
}
