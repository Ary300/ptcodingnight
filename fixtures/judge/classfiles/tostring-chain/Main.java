// A linked list whose toString recurses through string concatenation, never naming itself.
public class Main {
  static class Node {
    int v;
    Node next;

    Node(int v, Node next) {
      this.v = v;
      this.next = next;
    }

    @Override
    public String toString() {
      return v + (next == null ? "" : "," + next);
    }
  }

  public static void main(String[] args) {
    System.out.println(new Node(1, new Node(2, null)));
  }
}
