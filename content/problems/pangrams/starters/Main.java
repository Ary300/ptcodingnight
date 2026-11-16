import java.io.*;
import java.util.*;

class Result {

    /*
     * Complete the 'pangrams' function below.
     *
     * The function is expected to return a STRING.
     * The function accepts following parameter(s):
     *  1. STRING s
     */
    public static String pangrams(String s) {
        // Write your code here
        return "";
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

        // The sentence contains spaces, so it is read as one whole line.
        String s = IN.readLine();
        if (s == null) s = "";
        if (s.endsWith("\r")) s = s.substring(0, s.length() - 1);

        _out.print(Result.pangrams(s));
        _out.print('\n');

        _out.flush();
    }
}
