"""Closest Numbers -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny inputs; seeds of 55 and above
push n to the constraint ceiling. The seed also selects the shape of the input
so the test set covers adversarial layouts (arithmetic progressions where every
pair ties, a single tight pair hidden among widely spaced values, sorted and
reverse-sorted order, tight clusters with chained ties) and not just uniform
noise. Values are always distinct, as the constraints promise.
"""

import random
import sys

MAX_N = 3000
VMAX = 10**7


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 2 values, seed >= 55 -> the ceiling."""
    return max(2, min(MAX_N, seed * seed))


def build_values(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 6

    if shape == 0:
        # Uniform distinct noise over the full value range.
        return rng.sample(range(-VMAX, VMAX + 1), n)

    if shape == 1:
        # Arithmetic progression: every adjacent pair ties for the minimum.
        step = rng.randint(1, max(1, (2 * VMAX) // max(n, 2) - 1))
        start = rng.randint(-VMAX, VMAX - step * (n - 1))
        values = [start + i * step for i in range(n)]
        rng.shuffle(values)
        return values

    if shape == 2:
        # One tight pair (difference 1) hidden among widely spaced values.
        spacing = max(3, (2 * VMAX) // (n + 2))
        base = [-VMAX + i * spacing + rng.randint(0, spacing // 3) for i in range(n - 1)]
        tight = rng.choice(base[:-1]) + 1
        values = base + [tight]
        assert len(set(values)) == n
        rng.shuffle(values)
        return values

    if shape == 3:
        # Already sorted ascending.
        return sorted(rng.sample(range(-VMAX, VMAX + 1), n))

    if shape == 4:
        # Reverse sorted.
        return sorted(rng.sample(range(-VMAX, VMAX + 1), n), reverse=True)

    # shape == 5: a tight cluster, so many pairs tie for the minimum gap.
    span = max(2 * n, 10)
    center = rng.randint(-VMAX + span, VMAX - span)
    values = rng.sample(range(center - span, center + span + 1), n)
    return values


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    values = build_values(seed, n, rng)
    assert len(values) == n
    assert len(set(values)) == n
    assert all(-VMAX <= v <= VMAX for v in values)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(v) for v in values))
    out.write("\n")


if __name__ == "__main__":
    main()
