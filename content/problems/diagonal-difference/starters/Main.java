import java.io.*;
import java.util.*;

class Result {

    /*
     * Complete the 'diagonalDifference' function below.
     *
     * The function is expected to return an INTEGER.
     * The function accepts following parameter(s):
     *  1. 2D_INTEGER_ARRAY a
     */
    public static int diagonalDifference(int[][] a) {
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
        PrintWriter _out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));

        int n = nextInt();
        int[][] a = new int[n][n];
        for (int _i = 0; _i < n; _i++) {
            for (int _j = 0; _j < n; _j++) a[_i][_j] = nextInt();
        }

        _out.println(Result.diagonalDifference(a));

        _out.flush();
    }
}
