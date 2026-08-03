"""Booked Solid in Ayres -- reference solution.

Sweep line over half-open bookings [s, e).

Peak concurrency: turn every booking into a (+1 at s) and (-1 at e) event and
sort by (time, delta). Because -1 sorts before +1 at an equal time, a booking
ending at minute t is removed before one starting at minute t is added, which
is exactly the half-open, back-to-back-does-not-conflict rule.

Covered minutes: sort bookings by start and merge overlapping or touching
intervals, summing the merged lengths. Both passes are O(n log n).
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])

    events: list[tuple[int, int]] = []
    intervals: list[tuple[int, int]] = []
    for i in range(n):
        s = int(data[1 + 2 * i])
        e = int(data[2 + 2 * i])
        intervals.append((s, e))
        events.append((s, 1))
        events.append((e, -1))

    events.sort()
    active = 0
    peak = 0
    for _, delta in events:
        active += delta
        if active > peak:
            peak = active

    intervals.sort()
    covered = 0
    cur_start, cur_end = intervals[0]
    for s, e in intervals[1:]:
        if s > cur_end:
            covered += cur_end - cur_start
            cur_start, cur_end = s, e
        elif e > cur_end:
            cur_end = e
    covered += cur_end - cur_start

    sys.stdout.write(f"{peak}\n{covered}\n")


if __name__ == "__main__":
    main()
