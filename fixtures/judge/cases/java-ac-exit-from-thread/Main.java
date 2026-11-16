// Another thread prints the answer and exits 0 while main sleeps. A real exit ends main too.
public class Main {
  public static void main(String[] args) throws Exception {
    java.util.Scanner in = new java.util.Scanner(System.in);
    long a = in.nextLong(), b = in.nextLong();
    Thread t = new Thread(() -> {
      System.out.println(a + b);
      System.exit(0);
    });
    t.start();
    Thread.sleep(600000);
  }
}
