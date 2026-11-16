import java.io.*;
import java.util.*;

class Result {

    /*
     * Complete the 'circularArrayRotation' function below.
     *
     * The function is expected to return an INTEGER.
     * The function accepts following parameter(s):
     *  1. INTEGER k
     *  2. INTEGER_ARRAY a
     *  3. INTEGER j
     */
    public static int circularArrayRotation(int k, int[] a, int j) {
        // Write your code here
        return 0;
    }
}

// ---------------------------------------------------------------------------
// Everything below reads the input and prints the answer.
// You do not need to change anything below this line.
// ---------------------------------------------------------------------------
public class Main {
    private static final BufferedReader IN = new BufferedReader(new InputStreamReader(System.in));
    private static StringTokenizer TOK = new StringTokenizer("");

    private static String nextToken() throws IOException {
        while (!TOK.hasMoreTokens()) {
            String line = IN.readLine();
            if (line == null) return "";
            TOK = new StringTokenizer(line);
        }
        return TOK.nextToken();
    }

    private static int nextInt() throws IOException { return Integer.parseInt(nextToken()); }
    private static long nextLong() throws IOException { return Long.parseLong(nextToken()); }

    public static void main(String[] _args) throws IOException {
        PrintWriter out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));

        int n = nextInt();
        int k = nextInt();
        int q = nextInt();
        int[] a = new int[n];
        for (int _i = 0; _i < n; _i++) a[_i] = nextInt();
        for (int _q = 0; _q < q; _q++) {
            int j = nextInt();

            out.println(Result.circularArrayRotation(k, a, j));
        }

        out.flush();
    }
}
