"""Booked Solid in Ayres -- input generator.

Usage: python3 generator.py <seed> <n> <max_coord> [shape]

Deterministic per argument tuple. Shapes:

  random    uniform random bookings over [0, max_coord]
  sorted    bookings emitted in increasing start order
  reverse   bookings emitted in decreasing start order
  nested    a russian-doll tower plus random noise
  tiling    back-to-back chain (end of one == start of next) plus overlaps
  allequal  every booking is the identical interval
  pyramid   staircase of intervals all sharing one common moment
  bounds    every coordinate pinned to 0, 1, max_coord-1, or max_coord

Every shape guarantees 0 <= s < e <= max_coord.

Bounds are sized for a casual contest: n <= 1000 and every coordinate
<= 10^6, so the peak, every endpoint and the covered-minute total all fit a
signed 32-bit int. Tests 01 and 02 are the hand-written samples. The rest
were made with seed = 3997 + test number:

  test  seed  n     max_coord  shape     what it exercises
  03    4000  1     1000000    nested    single booking spanning [0, max]
  04    4001  1000  1000000    allequal  every booking identical (duplicates)
  05    4002  500   1000000    tiling    back-to-back chain, peak 1
  06    4003  1000  1000000    reverse   input in decreasing start order
  07    4004  800   100000     nested    russian-doll tower, peak = n
  08    4005  100   20         random    tiny coordinates, heavy overlap
  09    4006  1000  1000000    random    general case
  10    4007  200   1000000    bounds    endpoints pinned to 0, 1, max-1, max
  11    4008  1000  1000000    pyramid   all bookings share one moment
  12    4009  1000  1000000    random    general case, largest n
  13    4010  1000  1000       random    dense, many duplicate endpoints
  14    4011  1000  1000000    tiling    long back-to-back chain, peak 1
"""

import random
import sys

MAX_N = 1000
MAX_COORD = 10**6


def one_interval(rng: random.Random, max_coord: int) -> tuple[int, int]:
    s = rng.randint(0, max_coord - 1)
    e = rng.randint(s + 1, max_coord)
    return s, e


def build(rng: random.Random, n: int, max_coord: int, shape: str) -> list[tuple[int, int]]:
    if shape == "random":
        return [one_interval(rng, max_coord) for _ in range(n)]

    if shape == "sorted":
        return sorted(one_interval(rng, max_coord) for _ in range(n))

    if shape == "reverse":
        return sorted(
            (one_interval(rng, max_coord) for _ in range(n)), reverse=True
        )

    if shape == "nested":
        out: list[tuple[int, int]] = []
        lo, hi = 0, max_coord
        while len(out) < n and hi - lo >= 2:
            out.append((lo, hi))
            lo += 1
            hi -= 1
        while len(out) < n:
            out.append(one_interval(rng, max_coord))
        rng.shuffle(out)
        return out

    if shape == "tiling":
        out = []
        step = max(1, max_coord // max(n, 1) - 1)
        t = 0
        while len(out) < n and t + step <= max_coord:
            out.append((t, t + step))
            t += step
        while len(out) < n:
            out.append(one_interval(rng, max_coord))
        rng.shuffle(out)
        return out

    if shape == "allequal":
        s, e = one_interval(rng, max_coord)
        return [(s, e)] * n

    if shape == "pyramid":
        mid = max_coord // 2
        out = []
        for i in range(n):
            lo = max(0, mid - 1 - (i % mid if mid > 0 else 0))
            hi = min(max_coord, mid + 1 + (i % max(max_coord - mid, 1)))
            out.append((lo, max(hi, lo + 1)))
        rng.shuffle(out)
        return out

    if shape == "bounds":
        picks = [0, 1, max_coord - 1, max_coord]
        out = []
        while len(out) < n:
            s, e = rng.choice(picks), rng.choice(picks)
            if s < e:
                out.append((s, e))
        return out

    raise ValueError(f"unknown shape: {shape}")


def main() -> None:
    seed = int(sys.argv[1])
    n = int(sys.argv[2])
    max_coord = int(sys.argv[3])
    shape = sys.argv[4] if len(sys.argv) > 4 else "random"

    assert 1 <= n <= MAX_N
    assert 1 <= max_coord <= MAX_COORD

    rng = random.Random(seed)
    bookings = build(rng, n, max_coord, shape)

    assert len(bookings) == n
    assert all(0 <= s < e <= max_coord for s, e in bookings)

    out = sys.stdout
    out.write(f"{n}\n")
    for s, e in bookings:
        out.write(f"{s} {e}\n")


if __name__ == "__main__":
    main()
