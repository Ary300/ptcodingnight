import java.util.*;

// Static state must start fresh in every test. A Scanner held in a static field and a counter
// bumped by main both carry over if two tests ever share a class.
public class Main {
  static Scanner sc = new Scanner(System.in);
  static int calls = 0;
  static long total = 0;

  public static void main(String[] args) {
    calls++;
    total += sc.nextLong() + sc.nextLong();
    if (calls != 1) {
      System.out.println("statics carried over: " + calls);
      return;
    }
    System.out.println(total);
  }
}
