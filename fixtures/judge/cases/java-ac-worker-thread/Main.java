// main returns at once; a non-daemon thread prints the answer later. The JVM waits for it.
public class Main {
  public static void main(String[] args) {
    java.util.Scanner in = new java.util.Scanner(System.in);
    long a = in.nextLong(), b = in.nextLong();
    new Thread(() -> {
      try {
        Thread.sleep(200);
      } catch (InterruptedException e) {
        return;
      }
      System.out.println(a + b);
    }).start();
  }
}
