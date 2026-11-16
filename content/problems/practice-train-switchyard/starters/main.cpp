#include <bits/stdc++.h>
using namespace std;

/*
 * Complete the 'canDepartInOrder' function below.
 *
 * The function is expected to return a BOOLEAN: true when the cars can depart
 * in the order 1, 2, ..., n.
 * The function accepts following parameter(s):
 *  1. INTEGER_ARRAY cars
 */
bool canDepartInOrder(vector<int> cars) {
    // Write your code here
    return false;
}

/*
 * Complete the 'smallestDepartureOrder' function below.
 *
 * The function is expected to return an INTEGER_ARRAY.
 * The function accepts following parameter(s):
 *  1. INTEGER_ARRAY cars
 */
vector<int> smallestDepartureOrder(vector<int> cars) {
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
    vector<int> cars(n);
    for (int i_itr = 0; i_itr < n; i_itr++) cin >> cars[i_itr];

    cout << (canDepartInOrder(cars) ? "ON TIME" : "DELAYED") << "\n";

    vector<int> order = smallestDepartureOrder(cars);
    for (int i_itr = 0; i_itr < (int)order.size(); i_itr++) {
        if (i_itr > 0) cout << " ";
        cout << order[i_itr];
    }
    cout << "\n";

    return 0;
}
