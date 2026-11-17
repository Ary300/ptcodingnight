"""Beautiful Triplets -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny sequences; large seeds push n to
the constraint ceiling. The seed also selects the shape of the sequence so the
test set covers degenerate cases (a lone tree, a gap larger than the whole row,
a perfect arithmetic progression, decoy pairs with no third element) rather than
only uniform noise.

Shapes 0, 3 and 4 plant a few d-spaced trios among their noise or decoys, so a
program that prints 0 without looking cannot pass them. A zero answer is kept only
for the hand-written edge cases (a lone tree, a gap wider than the row).

Which seed made which test: 04 = seed 3, 06 = 6, 09 = 9,
10 = 13, 11 = 14, 12 = 16, 13 = 17, 14 = 18, 15 = 33, 16 = 40, 17 = 47, 18 = 49.
01-03, 05, 07 and 08 are written by hand.

Bounds are kept small for a casual contest: n <= 200, so the plain triple loop
over every (i, j, k) is about 1.3 million checks and runs quickly in Python,
and every value and d <= 10^6, so a + 2d stays far inside a signed 32-bit int
and no program needs a 64-bit type. Seeds 15 and above land on the n = 200
ceiling.
"""

import random
import sys

MAX_N = 200
MAX_VALUE = 10**6
MAX_D = 10**6


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 element, seed >= 15 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def random_increasing(rng: random.Random, n: int, low: int, high: int) -> list[int]:
    """n distinct values in [low, high], sorted increasing."""
    return sorted(rng.sample(range(low, high + 1), n))


def plant_trios(rng: random.Random, values: list[int], d: int, trios: int) -> list[int]:
    """Swap a few values for d-spaced trios (x, x + d, x + 2d), keeping n fixed.

    Planted values are never the ones dropped to make room, so every planted trio
    survives, and the result stays strictly increasing with the same length.
    """
    n = len(values)
    if n < 3 or 2 * d > MAX_VALUE:
        return values
    planted: set[int] = set()
    for _ in range(min(trios, n // 3)):
        x = rng.randint(0, MAX_VALUE - 2 * d)
        planted.update((x, x + d, x + 2 * d))
    others = [v for v in values if v not in planted]
    keep = rng.sample(others, max(0, n - len(planted)))
    return sorted(planted.union(keep))


def build_case(seed: int, n: int, rng: random.Random) -> tuple[int, list[int]]:
    shape = seed % 6

    if shape == 0:
        # Uniform noise over the full value range, small d, with a handful of
        # planted trios hidden in it.
        d = rng.randint(1, 100)
        noise = random_increasing(rng, n, 0, MAX_VALUE)
        return d, plant_trios(rng, noise, d, rng.randint(1, max(1, n // 40)))

    if shape == 1:
        # Perfect arithmetic progression with step exactly d: n - 2 triples.
        d = rng.randint(1, MAX_VALUE // max(n, 2))
        start = rng.randint(0, MAX_VALUE - d * (n - 1)) if n > 1 else rng.randint(0, MAX_VALUE)
        return d, [start + i * d for i in range(n)]

    if shape == 2:
        # Arithmetic progression with step s, asked about d = 2s: triples skip
        # every other element, so middles must sit two steps from both ends.
        s = rng.randint(1, MAX_VALUE // (2 * max(n, 2)))
        d = 2 * s
        start = rng.randint(0, MAX_VALUE - s * (n - 1)) if n > 1 else rng.randint(0, MAX_VALUE)
        return d, [start + i * s for i in range(n)]

    if shape == 3:
        # A tight cluster of values plus a d far wider than the cluster: only the
        # few trios planted far out across the value range can count.
        values = random_increasing(rng, n, 0, min(MAX_VALUE, max(4 * n, 100)))
        span = values[-1] - values[0]
        d = rng.randint(span + 1, MAX_D // 2)
        return d, plant_trios(rng, values, d, rng.randint(1, 3))

    if shape == 4:
        # Decoy pairs: many gaps of exactly d, but each pair is fenced off so no
        # third element lands d beyond it. Blocks of (x, x + d) spaced > 2d apart.
        d = rng.randint(1, max(1, MAX_VALUE // (2 * max(n, 2))))
        values: list[int] = []
        x = rng.randint(0, 10 * d)
        while len(values) + 2 <= n and x + d <= MAX_VALUE:
            values.extend([x, x + d])
            x += rng.randint(2 * d + 1, 3 * d + 7)
        if len(values) < n:
            top = values[-1] if values else 0
            extra = random_increasing(rng, n - len(values), top + 1, top + 1 + 10 * (n + 1))
            values.extend(extra)
        return d, plant_trios(rng, values, d, rng.randint(1, max(1, n // 50)))

    # shape == 5: dense consecutive integers with d = 1: the maximum n - 2 answer
    # plus duplicate-free adjacency everywhere.
    start = rng.randint(0, MAX_VALUE - n)
    return 1, [start + i for i in range(n)]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    d, values = build_case(seed, n, rng)

    assert len(values) == n
    assert 1 <= d <= MAX_D
    assert all(0 <= v <= MAX_VALUE for v in values)
    assert all(values[i] < values[i + 1] for i in range(n - 1))

    out = sys.stdout
    out.write(f"{n} {d}\n")
    out.write(" ".join(str(v) for v in values))
    out.write("\n")


if __name__ == "__main__":
    main()
