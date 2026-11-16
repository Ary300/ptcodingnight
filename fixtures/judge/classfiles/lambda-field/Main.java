import java.util.function.IntUnaryOperator;

// Recursion through a lambda held in a field: the lambda's body never names itself.
public class Main {
  static IntUnaryOperator f;

  public static void main(String[] args) {
    f = n -> n == 0 ? 0 : 1 + f.applyAsInt(n - 1);
    System.out.println(f.applyAsInt(10));
  }
}
