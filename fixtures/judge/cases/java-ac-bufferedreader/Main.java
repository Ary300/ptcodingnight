import java.io.*;
public class Main {
  public static void main(String[] args) throws IOException {
    BufferedReader r = new BufferedReader(new InputStreamReader(System.in));
    String[] parts = r.readLine().trim().split("\\s+");
    System.out.println(Integer.parseInt(parts[0]) + Integer.parseInt(parts[1]));
  }
}
