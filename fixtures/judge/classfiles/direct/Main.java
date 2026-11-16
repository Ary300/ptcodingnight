// A method that calls itself.
public class Main {
  static long fact(int n) {
    return n <= 1 ? 1 : n * fact(n - 1);
  }

  public static void main(String[] args) {
    System.out.println(fact(10));
  }
}
