#include <bits/stdc++.h>
using namespace std;

/*
 * Complete the 'jimOrders' function below.
 *
 * The function is expected to return an INTEGER_ARRAY.
 * The function accepts following parameter(s):
 *  1. INTEGER_ARRAY t
 *  2. INTEGER_ARRAY d
 */
vector<int> jimOrders(vector<int> t, vector<int> d) {
    // Write your code here
    return vector<int>();
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
    vector<int> t(n), d(n);
    for (int i_itr = 0; i_itr < n; i_itr++) cin >> t[i_itr] >> d[i_itr];

    vector<int> result = jimOrders(t, d);
    for (int i_itr = 0; i_itr < (int)result.size(); i_itr++) {
        if (i_itr > 0) cout << " ";
        cout << result[i_itr];
    }
    cout << "\n";

    return 0;
}
