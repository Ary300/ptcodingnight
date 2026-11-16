import java.io.*;
import java.util.*;

class Result {

    /*
     * Complete the 'swapCase' function below.
     *
     * The function is expected to return a STRING.
     * The function accepts following parameter(s):
     *  1. STRING s
     */
    public static String swapCase(String s) {
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

    public static void main(String[] _args) throws IOException {
        PrintWriter out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));

        // The line may contain spaces, so it is read whole rather than split.
        String s = IN.readLine();
        if (s == null) s = "";
        if (s.endsWith("\r")) s = s.substring(0, s.length() - 1);

        out.println(Result.swapCase(s));

        out.flush();
    }
}
