"""Flatland Space Stations -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny rows; large seeds push n to
the constraint ceiling. The seed also selects the shape of the station list so
the test set covers the degenerate cases (single station, every table a
station, heavy duplicates, stations crowded at one end, one huge middle gap)
and not just uniform noise.
"""

import random
import sys

MAX_N = 100000


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 table, seed >= 317 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_stations(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 6

    if shape == 0:
        # Uniform: m distinct stations scattered anywhere.
        m = rng.randint(1, n)
        return rng.sample(range(n), m)

    if shape == 1:
        # A single station somewhere in the row.
        return [rng.randint(0, n - 1)]

    if shape == 2:
        # Every table has a station; the answer is 0.
        stations = list(range(n))
        rng.shuffle(stations)
        return stations

    if shape == 3:
        # Heavy duplicates: few distinct positions, list padded with repeats.
        distinct = rng.sample(range(n), rng.randint(1, min(5, n)))
        m = rng.randint(len(distinct), n)
        stations = list(distinct)
        stations += [rng.choice(distinct) for _ in range(m - len(distinct))]
        rng.shuffle(stations)
        return stations

    if shape == 4:
        # Stations crowded into one end, leaving a long one-sided walk.
        left_end = rng.random() < 0.5
        width = max(1, n // 10)
        pool = range(width) if left_end else range(n - width, n)
        m = rng.randint(1, min(len(pool), n))
        return rng.sample(list(pool), m)

    # shape == 5: clusters at both ends, one huge gap through the middle.
    width = max(1, n // 20)
    left = list(range(width))
    right = list(range(n - width, n))
    pool = sorted(set(left + right))
    m = rng.randint(min(2, len(pool)), len(pool))
    return rng.sample(pool, m)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    stations = build_stations(seed, n, rng)
    m = len(stations)
    assert 1 <= m <= n
    assert all(0 <= c <= n - 1 for c in stations)
    out = sys.stdout
    out.write(f"{n} {m}\n")
    out.write(" ".join(str(c) for c in stations))
    out.write("\n")


if __name__ == "__main__":
    main()
