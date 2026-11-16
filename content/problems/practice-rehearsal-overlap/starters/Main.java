import java.io.*;
import java.util.*;

class Result {

    /*
     * Complete the 'maxActiveBookings' function below.
     *
     * The function is expected to return an INTEGER.
     * The function accepts following parameter(s):
     *  1. INTEGER_ARRAY starts
     *  2. INTEGER_ARRAY ends
     */
    public static int maxActiveBookings(int[] starts, int[] ends) {
        // Write your code here
        return 0;
    }

    /*
     * Complete the 'coveredMinutes' function below.
     *
     * The function is expected to return a LONG_INTEGER.
     * The function accepts following parameter(s):
     *  1. INTEGER_ARRAY starts
     *  2. INTEGER_ARRAY ends
     */
    public static long coveredMinutes(int[] starts, int[] ends) {
        // Write your code here
        return 0L;
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
        int[] starts = new int[n];
        int[] ends = new int[n];
        for (int _i = 0; _i < n; _i++) {
            starts[_i] = nextInt();
            ends[_i] = nextInt();
        }

        out.println(Result.maxActiveBookings(starts, ends));
        out.println(Result.coveredMinutes(starts, ends));

        out.flush();
    }
}
