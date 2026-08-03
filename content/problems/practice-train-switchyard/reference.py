"""The Coding Night Switchyard -- reference solution.

One pass with an explicit siding stack. suffix_min[i] is the smallest car still
waiting on the inbound track among positions i..n-1 (a sentinel of n+1 past the
end). Each arriving car is pushed, and the siding's top car is released whenever
it is smaller than every car still inbound: no smaller car could depart sooner,
and waiting can only bury it deeper. A car that "rolls straight through" is the
push followed immediately by the release, so the two-move model loses nothing.
All car numbers are distinct, which is what makes the strict comparison enough.

O(n) time, O(n) space.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    cars = [int(x) for x in data[1 : 1 + n]]

    sentinel = n + 1
    suffix_min = [sentinel] * (n + 1)
    for i in range(n - 1, -1, -1):
        below = suffix_min[i + 1]
        suffix_min[i] = cars[i] if cars[i] < below else below

    siding: list[int] = []
    departures: list[int] = []
    for i in range(n):
        siding.append(cars[i])
        remaining_min = suffix_min[i + 1]
        while siding and siding[-1] < remaining_min:
            departures.append(siding.pop())

    on_time = all(car == pos + 1 for pos, car in enumerate(departures))
    out = sys.stdout
    out.write("ON TIME\n" if on_time else "DELAYED\n")
    out.write(" ".join(str(car) for car in departures))
    out.write("\n")


if __name__ == "__main__":
    main()
