"""Chocolate Feast -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny budgets; large seeds push
n toward the constraint ceiling. The seed also selects a shape so the test
set covers the degenerate corners (exactly one bar, no trade ever fires,
wrapper count landing exactly on m, the longest possible trade chain) and
not just uniform noise.
"""

import random
import sys

MAX_N = 100000


def choose_n(seed: int, rng: random.Random) -> int:
    """Grow with the seed: seed 1 stays tiny, seed >= 100 can hit the ceiling."""
    ceiling = max(2, min(MAX_N, seed * seed * 10))
    return rng.randint(2, ceiling)


def build_case(seed: int, rng: random.Random) -> tuple[int, int, int]:
    n = choose_n(seed, rng)
    shape = seed % 6

    if shape == 0:
        # Uniform noise over the whole legal range.
        c = rng.randint(1, n)
        m = rng.randint(2, n)
        return n, c, m

    if shape == 1:
        # Exactly one bar bought: c in the upper half of n.
        c = rng.randint((n // 2) + 1, n)
        m = rng.randint(2, n)
        return n, c, m

    if shape == 2:
        # Longest chain: cheapest bars, cheapest trade.
        return n, 1, 2

    if shape == 3:
        # No trade ever fires: m strictly above the bar count when possible.
        c = rng.randint(1, n)
        bars = n // c
        m = rng.randint(min(bars + 1, n), n) if bars + 1 <= n else n
        return n, c, max(2, m)

    if shape == 4:
        # Wrapper count lands exactly on m after the initial purchase.
        c = rng.randint(1, max(1, n // 2))
        bars = n // c
        m = max(2, min(bars, n))
        return n, c, m

    # shape == 5: cheap bars, mid-sized trade ratio, several trade rounds.
    c = rng.randint(1, max(1, n // 20))
    m = rng.randint(2, max(2, min(n, 12)))
    return n, c, m


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n, c, m = build_case(seed, rng)
    assert 2 <= n <= MAX_N
    assert 1 <= c <= n
    assert 2 <= m <= n
    sys.stdout.write(f"{n} {c} {m}\n")


if __name__ == "__main__":
    main()
