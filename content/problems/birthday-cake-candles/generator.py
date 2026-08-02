"""Birthday Cake Candles -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny cakes; large seeds push n to
the constraint ceiling. The seed also selects the shape of the height list so
the test set covers degenerate cases (single candle, every candle equal, a
unique tallest candle hiding in a near-flat crowd, both height bounds) and
not just uniform noise.
"""

import random
import sys

MAX_N = 100000
MAX_H = 10**7


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 candle, seed >= 317 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_heights(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 6

    if shape == 0:
        # Uniform noise over the full height range.
        return [rng.randint(1, MAX_H) for _ in range(n)]

    if shape == 1:
        # Every candle is the same height: the answer is n.
        h = rng.randint(1, MAX_H)
        return [h] * n

    if shape == 2:
        # A unique tallest candle buried among candles exactly one shorter.
        # Punishes >= where > was meant, and off-by-one comparisons.
        top = rng.randint(2, MAX_H)
        heights = [top - 1] * n
        heights[rng.randrange(n)] = top
        return heights

    if shape == 3:
        # Only a handful of distinct heights, so the max repeats heavily.
        distinct = rng.randint(1, min(5, n))
        palette = rng.sample(range(1, MAX_H + 1), distinct)
        return [rng.choice(palette) for _ in range(n)]

    if shape == 4:
        # Sorted ascending, distinct where possible: the max sits last.
        start = rng.randint(1, MAX_H - n)
        return list(range(start, start + n))

    # shape == 5: both constraint bounds present, mixed with noise.
    heights = [rng.choice([1, MAX_H]) for _ in range(n)]
    for _ in range(n // 3):
        heights[rng.randrange(n)] = rng.randint(1, MAX_H)
    if MAX_H not in heights:
        heights[rng.randrange(n)] = MAX_H
    return heights


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    heights = build_heights(seed, n, rng)
    assert len(heights) == n
    assert all(1 <= h <= MAX_H for h in heights)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(h) for h in heights))
    out.write("\n")


if __name__ == "__main__":
    main()
