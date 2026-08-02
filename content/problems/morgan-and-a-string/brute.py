"""Morgan and a String -- brute force.

Definitional dynamic program: dp[i][j] is the smallest merge of a[i:] and b[j:],
computed as the minimum over the (at most two) possible next characters, each
followed by the best completion. No greedy insight is used anywhere, so this is
obviously correct, and it stores O(|a| * |b|) full strings, so it is hopeless at
the real constraints. It exists to validate reference.py on small inputs.
"""

import sys


def smallest_merge(a: str, b: str) -> str:
    la, lb = len(a), len(b)
    # dp over suffixes; row (i+1) is consumed to build row i.
    next_row = [b[j:] for j in range(lb + 1)]  # dp[la][j] = b[j:]
    for i in range(la - 1, -1, -1):
        row: list[str] = [""] * (lb + 1)
        row[lb] = a[i:]  # dp[i][lb] = a[i:]
        for j in range(lb - 1, -1, -1):
            take_a = a[i] + next_row[j]
            take_b = b[j] + row[j + 1]
            row[j] = min(take_a, take_b)
        next_row = row
    return next_row[0]


def main() -> None:
    data = sys.stdin.read().split()
    a, b = data[0], data[1]
    print(smallest_merge(a, b))


if __name__ == "__main__":
    main()
