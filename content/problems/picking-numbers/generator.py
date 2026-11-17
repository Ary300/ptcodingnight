"""Picking Numbers -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny lists; seeds of 32 and above
hit the n = 1000 ceiling. The ceiling is kept small on purpose for a casual
contest: a straightforward quadratic count stays well inside the time limit,
and every count fits easily in a 32-bit int. The seed also selects the shape
of the list so the test set covers degenerate cases (single element, one
repeated value, exactly two adjacent values, sorted ramps, tight clusters,
values spaced so that no two distinct values can ever be combined) and not just
uniform noise.

Tests 01-11 are hand-written. Tests 12-22 come from these seeds:

    12 <- 6    (n = 36, uniform noise)
    13 <- 13   (n = 169, all equal)
    14 <- 20   (n = 400, two adjacent values)
    15 <- 27   (n = 729, sorted ramp)
    16 <- 34   (n = 1000, tight clusters)
    17 <- 41   (n = 1000, spaced values)
    18 <- 100  (n = 1000, tight clusters)
    19 <- 200  (n = 1000, two adjacent values)
    20 <- 317  (n = 1000, spaced values)
    21 <- 318  (n = 1000, uniform noise)
    22 <- 320  (n = 1000, two adjacent values)
"""

import random
import sys

MAX_N = 1000
MAX_VALUE = 100


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 element, seed >= 32 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_list(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 6

    if shape == 0:
        # Uniform noise over the full value range.
        return [rng.randint(1, MAX_VALUE) for _ in range(n)]

    if shape == 1:
        # Every element is the same value.
        value = rng.randint(1, MAX_VALUE)
        return [value] * n

    if shape == 2:
        # Exactly two adjacent values, roughly half and half, shuffled.
        a = rng.randint(1, MAX_VALUE - 1)
        low_count = n // 2
        values = [a] * low_count + [a + 1] * (n - low_count)
        rng.shuffle(values)
        return values

    if shape == 3:
        # Nondecreasing ramp of random values (sorted input).
        return sorted(rng.randint(1, MAX_VALUE) for _ in range(n))

    if shape == 4:
        # Tight clusters around a few centers, each element within 1 of its
        # center, so adjacent-value combinations decide the answer.
        center_count = rng.randint(2, 6)
        centers = rng.sample(range(2, MAX_VALUE), center_count)
        return [
            min(MAX_VALUE, max(1, rng.choice(centers) + rng.randint(-1, 1)))
            for _ in range(n)
        ]

    # shape == 5: distinct values spaced at least 2 apart, so no two different
    # values can ever be picked together and the answer is one value's count.
    spaced = list(range(1, MAX_VALUE + 1, 2))
    return [rng.choice(spaced) for _ in range(n)]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    values = build_list(seed, n, rng)
    assert len(values) == n
    assert all(1 <= v <= MAX_VALUE for v in values)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(v) for v in values))
    out.write("\n")


if __name__ == "__main__":
    main()
