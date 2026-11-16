// Spins on the FIRST test (2 3) and answers the other two at once. The first test parks the
// submission in the slow lane (worker/lanes.ts); the two after it must still be AC, measured as
// they always are, however long the host kept the container waiting between them.
public class Main {
  public static void main(String[] args) {
    java.util.Scanner in = new java.util.Scanner(System.in);
    long a = in.nextLong(), b = in.nextLong();
    long x = 0;
    while (a == 2 && b == 3) x++;
    System.out.println(a + b + x);
  }
}
