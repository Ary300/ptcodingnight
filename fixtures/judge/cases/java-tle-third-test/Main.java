// Correct on the first two tests; spins on the third (whose answer is 0).
public class Main {
  public static void main(String[] args) {
    java.util.Scanner in = new java.util.Scanner(System.in);
    long a = in.nextLong(), b = in.nextLong();
    long x = 0;
    while (a + b == 0) x++;
    System.out.println(a + b + x);
  }
}
