"""Booked Solid in Ayres -- brute-force cross-check.

Definition-literal, different mechanism from the reference: split the timeline
at every distinct endpoint into elementary segments [a, b), and for each
segment scan ALL n bookings to count how many cover it (s <= a and e >= b).
Concurrency is constant inside an elementary segment, so the peak is the max
count over segments, and the covered minutes are the summed lengths of the
segments with a nonzero count.

O(n^2). Used only by the stress harness on small inputs; on the max tests
(n = 10^5) this is ~10^10 booking checks and would take hours, which is the
point: it validates the sweep by definition, not by speed.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    bookings = [
        (int(data[1 + 2 * i]), int(data[2 + 2 * i])) for i in range(n)
    ]

    coords = sorted({x for pair in bookings for x in pair})
    peak = 0
    covered = 0
    for a, b in zip(coords, coords[1:]):
        count = sum(1 for s, e in bookings if s <= a and e >= b)
        if count > 0:
            covered += b - a
        if count > peak:
            peak = count

    sys.stdout.write(f"{peak}\n{covered}\n")


if __name__ == "__main__":
    main()
