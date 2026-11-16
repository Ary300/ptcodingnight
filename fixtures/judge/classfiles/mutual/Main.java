// Two methods in two classes calling each other.
public class Main {
  static boolean even(int n) {
    return n == 0 || Helper.odd(n - 1);
  }

  public static void main(String[] args) {
    System.out.println(even(10));
  }
}

class Helper {
  static boolean odd(int n) {
    return n != 0 && Main.even(n - 1);
  }
}
