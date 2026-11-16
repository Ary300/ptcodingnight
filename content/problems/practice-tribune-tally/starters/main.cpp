#include <bits/stdc++.h>
using namespace std;

/*
 * Complete the 'tribuneTally' function below.
 *
 * The function is expected to return a 2D_INTEGER_ARRAY with one row per query:
 * {total ledger lines for that word, distinct issue numbers for that word}.
 * The function accepts following parameter(s):
 *  1. INTEGER_ARRAY issues
 *  2. STRING_ARRAY words
 *  3. STRING_ARRAY queries
 */
vector<vector<int>> tribuneTally(vector<int> issues, vector<string> words, vector<string> queries) {
    // Write your code here
    return vector<vector<int>>();
}

// ---------------------------------------------------------------------------
// Everything below reads the input and prints the answer.
// You do not need to change anything below this line.
// ---------------------------------------------------------------------------
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    cin >> n >> q;
    vector<int> issues(n);
    vector<string> words(n);
    for (int i_itr = 0; i_itr < n; i_itr++) cin >> issues[i_itr] >> words[i_itr];
    vector<string> queries(q);
    for (int i_itr = 0; i_itr < q; i_itr++) cin >> queries[i_itr];

    vector<vector<int>> result = tribuneTally(issues, words, queries);
    for (const vector<int>& row : result) {
        for (int j_itr = 0; j_itr < (int)row.size(); j_itr++) {
            if (j_itr > 0) cout << " ";
            cout << row[j_itr];
        }
        cout << "\n";
    }

    return 0;
}
