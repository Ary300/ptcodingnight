import java.io.*;
import java.util.*;

class Result {

    /*
     * Complete the 'miniMaxSum' function below.
     *
     * The function is expected to return an INTEGER_ARRAY.
     * The function accepts following parameter(s):
     *  1. INTEGER_ARRAY crates
     */
    public static int[] miniMaxSum(int[] crates) {
        // Write your code here
        {
            StringBuilder _p = new StringBuilder();
            _p.append(crates.length).append(':');
            for (int _j = 0; _j < crates.length; _j++) _p.append(' ').append(crates[_j]);
            System.out.println(_p);
        }
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
        StringBuilder _out = new StringBuilder();

        int[] crates = new int[5];
        for (int _i = 0; _i < 5; _i++) crates[_i] = nextInt();

        int[] _result = Result.miniMaxSum(crates);
        for (int _i = 0; _i < _result.length; _i++) {
            if (_i > 0) _out.append(" ");
            _out.append(_result[_i]);
        }
        _out.append('\n');

        System.out.print(_out);
    }
}

