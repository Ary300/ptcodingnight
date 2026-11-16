#include <bits/stdc++.h>
using namespace std;

/*
 * Complete the 'diagonalDifference' function below.
 *
 * The function is expected to return an INTEGER.
 * The function accepts following parameter(s):
 *  1. 2D_INTEGER_ARRAY a
 */
int diagonalDifference(vector<vector<int>> a) {
    // Write your code here
    return 0;
}

// ---------------------------------------------------------------------------
// Everything below reads the input and prints the answer.
// You do not need to change anything below this line.
// ---------------------------------------------------------------------------
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    cin >> n;
    vector<vector<int>> a(n, vector<int>(n));
    for (int i_itr = 0; i_itr < n; i_itr++) {
        for (int j_itr = 0; j_itr < n; j_itr++) cin >> a[i_itr][j_itr];
    }

    cout << diagonalDifference(a) << "\n";

    return 0;
}
