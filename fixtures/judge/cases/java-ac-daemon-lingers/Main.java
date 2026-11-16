// A daemon thread that never ends. It dies with a real JVM; it must not reach the next test.
public class Main {
  public static void main(String[] args) {
    java.util.Scanner in = new java.util.Scanner(System.in);
    long a = in.nextLong(), b = in.nextLong();
    Thread t = new Thread(() -> {
      while (true) {
        try {
          Thread.sleep(20);
        } catch (InterruptedException e) {
          return;
        }
        System.out.print("");
      }
    });
    t.setDaemon(true);
    t.start();
    System.out.println(a + b);
  }
}
