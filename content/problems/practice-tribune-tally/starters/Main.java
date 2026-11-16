import java.io.*;
import java.util.*;

class Result {

    /*
     * Complete the 'tribuneTally' function below.
     *
     * The function is expected to return a 2D_INTEGER_ARRAY with one row per query:
     * {total ledger lines for that word, distinct issue numbers for that word}.
     * The function accepts following parameter(s):
     *  1. INTEGER_ARRAY issues
     *  2. STRING_ARRAY words
     *  3. STRING_ARRAY queries
     */
    public static int[][] tribuneTally(int[] issues, String[] words, String[] queries) {
        // Write your code here
        return new int[0][];
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

    public static void main(String[] _args) throws IOException {
        PrintWriter out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));

        int n = nextInt();
        int q = nextInt();
        int[] issues = new int[n];
        String[] words = new String[n];
        for (int _i = 0; _i < n; _i++) {
            issues[_i] = nextInt();
            words[_i] = nextToken();
        }
        String[] queries = new String[q];
        for (int _i = 0; _i < q; _i++) queries[_i] = nextToken();

        int[][] _result = Result.tribuneTally(issues, words, queries);
        for (int[] _row : _result) {
            StringBuilder _line = new StringBuilder();
            for (int _j = 0; _j < _row.length; _j++) {
                if (_j > 0) _line.append(' ');
                _line.append(_row[_j]);
            }
            out.println(_line);
        }

        out.flush();
    }
}
