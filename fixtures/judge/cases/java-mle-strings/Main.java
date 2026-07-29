import java.util.*;
public class Main {
  public static void main(String[] args) {
    List<byte[]> held = new ArrayList<>();
    while (true) { held.add(new byte[64 * 1024 * 1024]); }
  }
}
