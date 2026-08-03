"""Beautiful Triplets -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny sequences; large seeds push n to
the constraint ceiling. The seed also selects the shape of the sequence so the
test set covers degenerate cases (a lone tree, a gap larger than the whole row,
a perfect arithmetic progression, decoy pairs with no third element) rather than
only uniform noise.
"""

import random
import sys

MAX_N = 2000
MAX_VALUE = 10**9
MAX_D = 10**9


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 element, seed >= 45 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def random_increasing(rng: random.Random, n: int, low: int, high: int) -> list[int]:
    """n distinct values in [low, high], sorted increasing."""
    return sorted(rng.sample(range(low, high + 1), n))


def build_case(seed: int, n: int, rng: random.Random) -> tuple[int, list[int]]:
    shape = seed % 6

    if shape == 0:
        # Uniform noise over the full value range, small d: few or no triples.
        d = rng.randint(1, 100)
        return d, random_increasing(rng, n, 0, MAX_VALUE)

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
        # d wider than the whole row: the answer is forced to zero.
        values = random_increasing(rng, n, 0, min(MAX_VALUE, max(4 * n, 100)))
        span = values[-1] - values[0]
        d = rng.randint(span + 1, MAX_D)
        return d, values

    if shape == 4:
        # Decoy pairs: many gaps of exactly d, but each pair is fenced off so no
        # third element lands d beyond it. Blocks of (x, x + d) spaced > 2d apart.
        d = rng.randint(1, 1000)
        values: list[int] = []
        x = rng.randint(0, 10 * d)
        while len(values) + 2 <= n and x + d <= MAX_VALUE:
            values.extend([x, x + d])
            x += rng.randint(2 * d + 1, 3 * d + 7)
        if len(values) < n:
            top = values[-1] if values else 0
            extra = random_increasing(rng, n - len(values), top + 1, top + 1 + 10 * (n + 1))
            values.extend(extra)
        return d, values

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
