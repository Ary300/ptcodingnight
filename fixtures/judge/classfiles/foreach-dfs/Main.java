import java.util.*;

// A depth-first search that recurses through List.forEach: dfs never calls dfs directly.
public class Main {
  static List<List<Integer>> adj = new ArrayList<>();
  static boolean[] seen;

  static void dfs(int u) {
    seen[u] = true;
    adj.get(u).forEach(v -> {
      if (!seen[v]) dfs(v);
    });
  }

  public static void main(String[] args) {
    int n = 5;
    seen = new boolean[n];
    for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
    for (int i = 0; i + 1 < n; i++) adj.get(i).add(i + 1);
    dfs(0);
    System.out.println(seen[n - 1]);
  }
}
