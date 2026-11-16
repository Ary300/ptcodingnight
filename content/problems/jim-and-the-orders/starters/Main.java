import java.io.*;
import java.util.*;

class Result {

    /*
     * Complete the 'jimOrders' function below.
     *
     * The function is expected to return an INTEGER_ARRAY.
     * The function accepts following parameter(s):
     *  1. INTEGER_ARRAY t
     *  2. INTEGER_ARRAY d
     */
    public static int[] jimOrders(int[] t, int[] d) {
        // Write your code here
        return new int[0];
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
        PrintWriter _out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));

        int n = nextInt();
        int[] t = new int[n];
        int[] d = new int[n];
        for (int _i = 0; _i < n; _i++) {
            t[_i] = nextInt();
            d[_i] = nextInt();
        }

        int[] _result = Result.jimOrders(t, d);
        for (int _i = 0; _i < _result.length; _i++) {
            if (_i > 0) _out.print(' ');
            _out.print(_result[_i]);
        }
        _out.print('\n');

        _out.flush();
    }
}
