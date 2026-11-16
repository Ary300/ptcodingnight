// Compile bomb: each nested conditional around a generic call doubles javac's inference work, so
// this never finishes inside the compile timeout. Must be CE with a plain message, never IE.
public class Main {
  static <T> T id(T t) { return t; }
  public static void main(String[] args) {
    boolean b = args.length == 0;
    Integer r = id(b ? id(b ? id(b ? id(b ? id(b ? id(b ? id(b ? id(b ? id(b ? id(b ? id(b ? id(b ? id(b ? id(b ? id(b ? id(b ? 1 : id(2)) : id(2)) : id(2)) : id(2)) : id(2)) : id(2)) : id(2)) : id(2)) : id(2)) : id(2)) : id(2)) : id(2)) : id(2)) : id(2)) : id(2)) : id(2));
    System.out.println(r);
  }
}
