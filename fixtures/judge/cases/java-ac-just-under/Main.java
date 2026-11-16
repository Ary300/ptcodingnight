// Finishes 2 s under the TLE threshold (2 s x 2 + 2 s startup budget = 6 s), with the right
// answer, in the harness. Killed at the threshold, a test like this must still be AC.
import java.util.Scanner;

public class Main {
  public static void main(String[] args) throws InterruptedException {
    Scanner in = new Scanner(System.in);
    long a = in.nextLong();
    long b = in.nextLong();
    Thread.sleep(4000);
    System.out.println(a + b);
  }
}
