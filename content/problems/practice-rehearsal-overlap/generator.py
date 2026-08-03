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
"""

import random
import sys

MAX_N = 100000
MAX_COORD = 10**9


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
