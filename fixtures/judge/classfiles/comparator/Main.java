import java.util.*;

// Comparable and Comparator implementations built from Integer.compare: no recursion.
public class Main {
  static class P implements Comparable<P> {
    int x;
    int y;

    P(int x, int y) {
      this.x = x;
      this.y = y;
    }

    @Override
    public int compareTo(P o) {
      return x != o.x ? Integer.compare(x, o.x) : Integer.compare(y, o.y);
    }
  }

  static class ByY implements Comparator<P> {
    @Override
    public int compare(P a, P b) {
      return Integer.compare(a.y, b.y);
    }
  }

  public static void main(String[] args) {
    P[] ps = {new P(2, 1), new P(1, 2)};
    Arrays.sort(ps);
    Arrays.sort(ps, new ByY());
    System.out.println(ps[0].x);
  }
}
