"""Permuting Two Arrays -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny queries; large seeds push n
to the constraint ceiling. Each query's shape is drawn per seed so the test
set covers adversarial cases (sums exactly on the threshold, exactly one
unit short, extreme values, all-equal arrays, presorted arrays) and not just
uniform noise.
"""

import random
import sys

MAX_Q = 10
MAX_N = 10**4
MAX_V = 10**9
MAX_K = 2 * MAX_V


def choose_n(seed: int, rng: random.Random) -> int:
    """Grow with the seed: seed 1 -> a handful, seed >= 1000 -> always the
    ceiling (so a large seed produces a guaranteed maximum-size input)."""
    if seed >= 1000:
        return MAX_N
    ceiling = max(1, min(MAX_N, seed * seed))
    return rng.randint(1, ceiling)


def tight_pair(rng: random.Random, n: int, k: int) -> tuple[list[int], list[int]]:
    """A and B such that some pairing gives every sum exactly k."""
    lo = max(0, k - MAX_V)
    hi = min(MAX_V, k)
    a = [rng.randint(lo, hi) for _ in range(n)]
    b = [k - x for x in a]
    rng.shuffle(b)
    return a, b


def build_query(rng: random.Random, n: int) -> tuple[int, list[int], list[int]]:
    shape = rng.randrange(6)

    if shape == 0:
        # Uniform noise over the full value range, k anywhere in range.
        hi = rng.choice([10, 1000, MAX_V])
        a = [rng.randint(0, hi) for _ in range(n)]
        b = [rng.randint(0, hi) for _ in range(n)]
        return rng.randint(0, min(MAX_K, 2 * hi)), a, b

    if shape == 1:
        # Every achievable sum is exactly k: the tightest possible YES.
        k = rng.randint(0, MAX_K)
        a, b = tight_pair(rng, n, k)
        return k, a, b

    if shape == 2:
        # One unit short of the threshold somewhere: the tightest possible NO.
        k = rng.randint(1, MAX_K)
        a, b = tight_pair(rng, n, k - 1)
        return k, a, b

    if shape == 3:
        # All elements equal in each array.
        x = rng.randint(0, MAX_V)
        y = rng.randint(0, MAX_V)
        k = rng.choice([x + y, x + y + 1, rng.randint(0, MAX_K)])
        return k, [x] * n, [y] * n

    if shape == 4:
        # Presorted input: A ascending, B ascending or descending.
        hi = rng.choice([100, MAX_V])
        a = sorted(rng.randint(0, hi) for _ in range(n))
        b = sorted((rng.randint(0, hi) for _ in range(n)),
                   reverse=rng.random() < 0.5)
        return rng.randint(0, min(MAX_K, 2 * hi)), a, b

    # shape == 5: values pinned to the extremes, heavy duplication.
    pool = [0, 1, MAX_V - 1, MAX_V]
    a = [rng.choice(pool) for _ in range(n)]
    b = [rng.choice(pool) for _ in range(n)]
    k = rng.choice([0, 1, MAX_V, MAX_K - 1, MAX_K])
    return k, a, b


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    q = 1 + seed % MAX_Q
    lines = [str(q)]
    for _ in range(q):
        n = choose_n(seed, rng)
        k, a, b = build_query(rng, n)
        assert 1 <= n <= MAX_N
        assert 0 <= k <= MAX_K
        assert all(0 <= x <= MAX_V for x in a)
        assert all(0 <= x <= MAX_V for x in b)
        lines.append(f"{n} {k}")
        lines.append(" ".join(str(x) for x in a))
        lines.append(" ".join(str(x) for x in b))
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
