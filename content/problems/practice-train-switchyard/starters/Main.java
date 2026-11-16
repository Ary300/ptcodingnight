import java.io.*;
import java.util.*;

class Result {

    /*
     * Complete the 'canDepartInOrder' function below.
     *
     * The function is expected to return a BOOLEAN: true when the cars can depart
     * in the order 1, 2, ..., n.
     * The function accepts following parameter(s):
     *  1. INTEGER_ARRAY cars
     */
    public static boolean canDepartInOrder(int[] cars) {
        // Write your code here
        return false;
    }

    /*
     * Complete the 'smallestDepartureOrder' function below.
     *
     * The function is expected to return an INTEGER_ARRAY.
     * The function accepts following parameter(s):
     *  1. INTEGER_ARRAY cars
     */
    public static int[] smallestDepartureOrder(int[] cars) {
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

    public static void main(String[] _args) throws IOException {
        PrintWriter out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));

        int n = nextInt();
        int[] cars = new int[n];
        for (int _i = 0; _i < n; _i++) cars[_i] = nextInt();

        out.println(Result.canDepartInOrder(cars) ? "ON TIME" : "DELAYED");

        int[] _order = Result.smallestDepartureOrder(cars);
        StringBuilder _line = new StringBuilder();
        for (int _i = 0; _i < _order.length; _i++) {
            if (_i > 0) _line.append(' ');
            _line.append(_order[_i]);
        }
        out.println(_line);

        out.flush();
    }
}
