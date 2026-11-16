#include <bits/stdc++.h>
using namespace std;

/*
 * Complete the 'minimumCrates' function below.
 *
 * The function is expected to return an INTEGER.
 * The function accepts following parameter(s):
 *  1. INTEGER_ARRAY weights
 */
int minimumCrates(vector<int> weights) {
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
    vector<int> weights(n);
    for (int i_itr = 0; i_itr < n; i_itr++) cin >> weights[i_itr];

    cout << minimumCrates(weights) << "\n";

    return 0;
}
