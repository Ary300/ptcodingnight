import java.io.*;
import java.util.*;

// No recursion anywhere: loops, collections, a comparator lambda, string concatenation.
public class Main {
  static int[] read(BufferedReader in) throws IOException {
    StringTokenizer t = new StringTokenizer(in.readLine());
    int n = Integer.parseInt(t.nextToken());
    int[] a = new int[n];
    for (int i = 0; i < n; i++) a[i] = Integer.parseInt(t.nextToken());
    return a;
  }

  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    int[] a = read(in);
    Map<Integer, Integer> count = new HashMap<>();
    for (int x : a) count.merge(x, 1, Integer::sum);
    List<Integer> keys = new ArrayList<>(count.keySet());
    keys.sort((x, y) -> count.get(y) - count.get(x));
    StringBuilder sb = new StringBuilder();
    for (int k : keys) sb.append(k).append(' ').append(count.get(k)).append('\n');
    System.out.print("answer: " + sb);
  }
}
