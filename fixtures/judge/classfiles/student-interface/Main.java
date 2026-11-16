// Recursion through the student's own functional interface, implemented by a lambda.
public class Main {
  interface Step {
    int go(int n);
  }

  static Step step;

  public static void main(String[] args) {
    step = n -> n == 0 ? 0 : step.go(n - 1) + 1;
    System.out.println(step.go(5));
  }
}
