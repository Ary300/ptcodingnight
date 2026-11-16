// Writes the answer with write(int) and never flushes or ends the line. A fresh JVM loses those
// bytes at exit, so the output is empty.
public class Main {
  public static void main(String[] args) {
    java.util.Scanner in = new java.util.Scanner(System.in);
    long a = in.nextLong(), b = in.nextLong();
    for (byte x : String.valueOf(a + b).getBytes()) System.out.write(x);
  }
}
