"""Flatland Space Stations -- brute-force solution.

The definition read literally: for every table, find the distance to its
nearest station, then take the maximum over all tables. Each per-table lookup
is a bisect into the sorted station list, so this is O(n log m) rather than
the O(m log m) gap scan of the reference; the mechanism is per-table nearest
neighbour, not gap arithmetic. The fully naive O(n * m) pairwise scan cannot
finish n = m = 10^5 inside the limit, so this is the most definition-literal
implementation that still passes the largest test.
"""

import bisect
import sys


def nearest_distance(stations: list[int], table: int) -> int:
    """Distance from `table` to the closest value in sorted `stations`."""
    i = bisect.bisect_left(stations, table)
    best = None
    if i < len(stations):
        best = stations[i] - table
    if i > 0:
        left = table - stations[i - 1]
        if best is None or left < best:
            best = left
    assert best is not None
    return best


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    m = int(data[1])
    stations = sorted(set(int(x) for x in data[2:2 + m]))

    print(max(nearest_distance(stations, t) for t in range(n)))


if __name__ == "__main__":
    main()
