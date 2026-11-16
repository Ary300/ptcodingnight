#include <bits/stdc++.h>
using namespace std;

/*
 * Complete the 'swapCase' function below.
 *
 * The function is expected to return a STRING.
 * The function accepts following parameter(s):
 *  1. STRING s
 */
string swapCase(string s) {
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

    // The line may contain spaces, so it is read whole rather than split.
    string s;
    getline(cin, s);
    if (!s.empty() && s.back() == '\r') s.pop_back();

    cout << swapCase(s) << "\n";

    return 0;
}
