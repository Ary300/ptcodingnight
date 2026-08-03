"""Marc's Cakewalk -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny boxes; large seeds push n to
the ceiling of 40. The seed also selects the shape of the calorie list so the
test set covers the degenerate cases (a single cupcake, all counts equal,
already sorted in either direction, heavy duplication, both calorie bounds)
and not just uniform noise.
"""

import random
import sys

MAX_N = 40
MAX_CAL = 1000


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 cupcake, seed >= 7 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_box(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 6

    if shape == 0:
        # Uniform noise across the full calorie range.
        return [rng.randint(1, MAX_CAL) for _ in range(n)]

    if shape == 1:
        # Every cupcake identical, so all orders cost the same.
        cal = rng.randint(1, MAX_CAL)
        return [cal] * n

    if shape == 2:
        # Already sorted ascending: the worst possible order as given.
        return sorted(rng.randint(1, MAX_CAL) for _ in range(n))

    if shape == 3:
        # Already sorted descending: the optimal order as given.
        return sorted((rng.randint(1, MAX_CAL) for _ in range(n)), reverse=True)

    if shape == 4:
        # Heavy duplication from a tiny value pool, including both bounds.
        pool = [1, MAX_CAL] + [rng.randint(1, MAX_CAL) for _ in range(3)]
        return [rng.choice(pool) for _ in range(n)]

    # shape == 5: near-maximal values, stressing the 64-bit ceiling.
    return [rng.randint(MAX_CAL - 5, MAX_CAL) for _ in range(n)]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    box = build_box(seed, n, rng)
    assert len(box) == n
    assert all(1 <= c <= MAX_CAL for c in box)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(c) for c in box))
    out.write("\n")


if __name__ == "__main__":
    main()
