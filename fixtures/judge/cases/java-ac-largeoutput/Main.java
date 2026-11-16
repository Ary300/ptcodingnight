import java.io.*;

// A 1.29 MB, 200,000-line answer printed in ONE call, the way a StringBuilder-based solution does.
// The per-process JVM writes it with one syscall; the harness must not take one per line.
public class Main {
  public static void main(String[] args) throws IOException {
    int n = Integer.parseInt(new BufferedReader(new InputStreamReader(System.in)).readLine().trim());
    StringBuilder sb = new StringBuilder();
    for (int i = 1; i <= n; i++) sb.append(i).append('\n');
    System.out.print(sb);
  }
}
