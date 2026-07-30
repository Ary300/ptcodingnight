import java.io.*;
import java.util.*;

// Java 21 only:
//   - records                    (Java 16+)
//   - pattern matching in switch (Java 21)
//   - sealed interfaces          (Java 17+)
public class Main {
    sealed interface Expr permits Sum {}
    record Sum(long a, long b) implements Expr {}

    static long eval(Expr e) {
        return switch (e) {
            case Sum s -> s.a() + s.b();
        };
    }

    public static void main(String[] args) throws IOException {
        var in = new BufferedReader(new InputStreamReader(System.in));
        var tok = new StringTokenizer(in.readLine());
        long a = Long.parseLong(tok.nextToken());
        long b = Long.parseLong(tok.nextToken());
        System.out.println(eval(new Sum(a, b)));
    }
}
