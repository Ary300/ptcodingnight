"""Flatland Space Stations -- reference solution.

Sort the distinct station positions. The answer is the largest of:
the distance from table 0 to the first station, the distance from the last
station to table n-1, and half of each gap between consecutive stations
(rounded down, since the midpoint table is equidistant from both sides).
O(m log m).
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    m = int(data[1])
    stations = sorted(set(int(x) for x in data[2:2 + m]))

    best = max(stations[0], (n - 1) - stations[-1])
    for a, b in zip(stations, stations[1:]):
        half = (b - a) // 2
        if half > best:
            best = half

    print(best)


if __name__ == "__main__":
    main()
