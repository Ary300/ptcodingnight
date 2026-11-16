// System.exit never returns in a real JVM, so nothing after it may reach the output, even when
// the program catches everything around the call.
public class Main {
  public static void main(String[] args) {
    java.util.Scanner in = new java.util.Scanner(System.in);
    long a = in.nextLong(), b = in.nextLong();
    System.out.println(a + b);
    try {
      System.exit(0);
    } catch (Throwable t) {
      System.out.println("survived exit");
    }
    System.out.println("after exit");
  }
}
