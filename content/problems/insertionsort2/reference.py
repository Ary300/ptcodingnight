"""Insertion Sort - Part 2 -- reference solution.

After the i-th insertion (1-indexed over the n-1 insertions), the array is
sorted(a[0..i]) followed by the untouched tail a[i+1..]. Maintain the sorted
prefix with bisect.insort and precompute the tail strings, so the loop body
stays at C speed instead of shifting elements one by one in Python.
"""

import bisect
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    values = [int(x) for x in data[1:1 + n]]
    tokens = [x.decode() for x in data[1:1 + n]]

    # suffix[j] = tokens[j:] joined by spaces ("" when j == n).
    suffix = [""] * (n + 1)
    for j in range(n - 1, -1, -1):
        tail = suffix[j + 1]
        suffix[j] = tokens[j] if not tail else tokens[j] + " " + tail

    prefix = [values[0]] if n else []
    lines: list[str] = []
    for i in range(1, n):
        bisect.insort(prefix, values[i])
        head = " ".join(map(str, prefix))
        tail = suffix[i + 1]
        lines.append(head if not tail else head + " " + tail)

    sys.stdout.write("\n".join(lines) + ("\n" if lines else ""))


if __name__ == "__main__":
    main()
