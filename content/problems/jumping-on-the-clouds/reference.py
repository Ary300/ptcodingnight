"""Reference solution: minimum hops across the catwalk.

Straightforward dynamic programming. best[i] = fewest hops needed to reach
panel i from panel 0, moving forward by one or two panels at a time and
never landing on a taped panel.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    panels = [int(x) for x in data[1:1 + n]]

    INF = float("inf")
    best = [INF] * n
    best[0] = 0

    for i in range(1, n):
        if panels[i] == 1:
            continue  # taped panel: never land here
        from_one_back = best[i - 1]
        from_two_back = best[i - 2] if i >= 2 else INF
        nearest = min(from_one_back, from_two_back)
        if nearest != INF:
            best[i] = nearest + 1

    print(best[n - 1])


if __name__ == "__main__":
    main()
