"""Beautiful Triplets -- brute-force checker.

Definition-literal index scanning with no hashing: for every pair i < j whose gap
is exactly d, scan the suffix for a k > j whose gap from j is also d. Because the
sequence is strictly increasing, at most one j matches each i, so the whole thing
is O(n^2) rather than O(n^3); a full triple enumeration cannot finish at n = 2000
in Python, and this is the most literal reading of the definition that can.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    d = int(data[1])
    a = [int(x) for x in data[2:2 + n]]

    count = 0
    for i in range(n):
        for j in range(i + 1, n):
            if a[j] - a[i] == d:
                for k in range(j + 1, n):
                    if a[k] - a[j] == d:
                        count += 1

    print(count)


if __name__ == "__main__":
    main()
