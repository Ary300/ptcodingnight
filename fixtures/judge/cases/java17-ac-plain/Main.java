import java.io.*;
import java.util.*;

// Deliberately plain: no feature newer than Java 8, so this compiles at every --release the
// registry offers. It proves the level is USABLE, while the variant-* pairs prove the level is
// ENFORCED. Both matter and neither implies the other.
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer tok = new StringTokenizer(in.readLine());
        long a = Long.parseLong(tok.nextToken());
        long b = Long.parseLong(tok.nextToken());
        System.out.println(a + b);
    }
}
