#include <bits/stdc++.h>
using namespace std;

/*
 * Complete the 'pangrams' function below.
 *
 * The function is expected to return a STRING.
 * The function accepts following parameter(s):
 *  1. STRING s
 */
string pangrams(string s) {
    // Write your code here
    return "";
}

// ---------------------------------------------------------------------------
// Everything below reads the input and prints the answer.
// You do not need to change anything below this line.
// ---------------------------------------------------------------------------
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // The sentence contains spaces, so it is read as one whole line.
    string s;
    getline(cin, s);
    if (!s.empty() && s.back() == '\r') s.pop_back();

    cout << pangrams(s) << "\n";

    return 0;
}
