#include <bits/stdc++.h>
using namespace std;

/*
 * Complete the 'maxActiveBookings' function below.
 *
 * The function is expected to return an INTEGER.
 * The function accepts following parameter(s):
 *  1. INTEGER_ARRAY starts
 *  2. INTEGER_ARRAY ends
 */
int maxActiveBookings(vector<int> starts, vector<int> ends) {
    // Write your code here
    return 0;
}

/*
 * Complete the 'coveredMinutes' function below.
 *
 * The function is expected to return a LONG_INTEGER.
 * The function accepts following parameter(s):
 *  1. INTEGER_ARRAY starts
 *  2. INTEGER_ARRAY ends
 */
long long coveredMinutes(vector<int> starts, vector<int> ends) {
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
    vector<int> starts(n), ends(n);
    for (int i_itr = 0; i_itr < n; i_itr++) cin >> starts[i_itr] >> ends[i_itr];

    cout << maxActiveBookings(starts, ends) << "\n";
    cout << coveredMinutes(starts, ends) << "\n";

    return 0;
}
