#include <bits/stdc++.h>
using namespace std;

/*
 * Complete the 'luckBalance' function below.
 *
 * The function is expected to return an INTEGER.
 * The function accepts following parameter(s):
 *  1. INTEGER k
 *  2. INTEGER_ARRAY luck
 *  3. INTEGER_ARRAY important
 */
int luckBalance(int k, vector<int> luck, vector<int> important) {
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

    int n, k;
    cin >> n >> k;
    vector<int> luck(n), important(n);
    for (int i_itr = 0; i_itr < n; i_itr++) cin >> luck[i_itr] >> important[i_itr];

    cout << luckBalance(k, luck, important) << "\n";

    return 0;
}
