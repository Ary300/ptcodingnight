"""Insertion Sort - Part 1 -- brute / cross-check solution.

Different approach from the reference: instead of mutating one array in
place, compute the insertion point with bisect_right and construct every
printed line from scratch by slicing the ORIGINAL array. The state after
copying the element at index j one slot right is exactly

    a[0:j] + [a[j]] + a[j:n-1]

and the final line is a[0:p] + [value] + a[p:n-1] where p is the number of
prefix elements not greater than value. O(n) fresh lists per line, no
concern for efficiency.
"""

import sys
from bisect import bisect_right


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]

    value = a[-1]
    prefix = a[:n - 1]
    p = bisect_right(prefix, value)

    lines: list[list[int]] = []
    for j in range(n - 2, p - 1, -1):
        lines.append(a[0:j] + [a[j]] + a[j:n - 1])
    lines.append(a[0:p] + [value] + a[p:n - 1])

    sys.stdout.write(
        "\n".join(" ".join(map(str, line)) for line in lines) + "\n"
    )


if __name__ == "__main__":
    main()
