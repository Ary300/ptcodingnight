"""Jim and the Orders -- brute-force / definition-literal solution.

No sort call. Reads the statement literally: walk every possible finish time
from the smallest to the largest, and at each minute hand out every order that
finishes exactly then, in increasing order number. Orders are grouped by finish
time as they are read, so within a group they are already in ticket order.

O(n + maxFinish) time; maxFinish is at most 2 * 10^6, so this passes the
largest test comfortably, just by a different route than the reference.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])

    by_finish: dict[int, list[int]] = {}
    for i in range(1, n + 1):
        t = int(data[2 * i - 1])
        d = int(data[2 * i])
        by_finish.setdefault(t + d, []).append(i)

    lo = min(by_finish)
    hi = max(by_finish)
    served: list[int] = []
    for minute in range(lo, hi + 1):
        group = by_finish.get(minute)
        if group is not None:
            served.extend(group)

    sys.stdout.write(" ".join(map(str, served)))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
