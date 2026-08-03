"""Permuting Two Arrays -- reference solution.

For each query, sort A ascending and B descending and pair them index by
index. This pairing maximizes the minimum pair sum, so a threshold k is
achievable by some permutation if and only if it is achievable by this one.
O(n log n) per query.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    pos = 0
    q = int(data[pos])
    pos += 1
    out: list[str] = []
    for _ in range(q):
        n = int(data[pos])
        k = int(data[pos + 1])
        pos += 2
        a = [int(x) for x in data[pos:pos + n]]
        pos += n
        b = [int(x) for x in data[pos:pos + n]]
        pos += n
        a.sort()
        b.sort(reverse=True)
        ok = all(x + y >= k for x, y in zip(a, b))
        out.append("YES" if ok else "NO")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
