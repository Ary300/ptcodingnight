// Prints a stack trace with a cause and a suppressed exception to STDOUT, where it becomes the
// answer a sample's diff snippet shows. No frame beneath the student's own may appear in it.
public class Main {
  static RuntimeException build() {
    RuntimeException outer = new RuntimeException("outer", new IllegalStateException("cause"));
    outer.addSuppressed(new IllegalArgumentException("suppressed"));
    return outer;
  }

  public static void main(String[] args) {
    build().printStackTrace(System.out);
  }
}
