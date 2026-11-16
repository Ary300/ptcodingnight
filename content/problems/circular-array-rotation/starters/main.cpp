#include <bits/stdc++.h>
using namespace std;

/*
 * Complete the 'circularArrayRotation' function below.
 *
 * The function is expected to return an INTEGER.
 * The function accepts following parameter(s):
 *  1. INTEGER k
 *  2. INTEGER_ARRAY a
 *  3. INTEGER j
 */
int circularArrayRotation(int k, const vector<int>& a, int j) {
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

    int n, k, q;
    cin >> n >> k >> q;
    vector<int> a(n);
    for (int i_itr = 0; i_itr < n; i_itr++) cin >> a[i_itr];

    for (int q_itr = 0; q_itr < q; q_itr++) {
        int j;
        cin >> j;

        cout << circularArrayRotation(k, a, j) << "\n";
    }

    return 0;
}
