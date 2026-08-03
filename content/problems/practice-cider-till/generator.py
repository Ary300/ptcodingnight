"""The Cider Store Till -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short shifts; large seeds push n to
the constraint ceiling. The seed also selects the shape of the log so the test
set covers the degenerate cases (single sale, all sales equal, sorted and
reverse-sorted logs, repeated maxima, values pinned to the bounds) and not just
uniform noise.
"""

import random
import sys

MAX_N = 1000
MAX_P = 100000


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 sale, seed >= 32 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_log(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 7

    if shape == 0:
        # Uniform noise across the full range of amounts.
        return [rng.randint(1, MAX_P) for _ in range(n)]

    if shape == 1:
        # Every sale is the same amount.
        amount = rng.randint(1, MAX_P)
        return [amount] * n

    if shape == 2:
        # Strictly increasing log: the largest sale is the last one rung up.
        amounts = rng.sample(range(1, MAX_P + 1), n)
        return sorted(amounts)

    if shape == 3:
        # Strictly decreasing log: the largest sale is the first one rung up.
        amounts = rng.sample(range(1, MAX_P + 1), n)
        return sorted(amounts, reverse=True)

    if shape == 4:
        # The maximum is repeated several times, buried among smaller sales.
        peak = rng.randint(2, MAX_P)
        copies = max(2, min(n, rng.randint(2, 5)))
        log = [peak] * copies
        log += [rng.randint(1, peak - 1) for _ in range(n - copies)]
        rng.shuffle(log)
        return log[:n]

    if shape == 5:
        # Values pinned to the bounds: a mix of 1s and MAX_P, nothing between.
        log = [1 if rng.random() < 0.5 else MAX_P for _ in range(n)]
        return log

    # shape == 6: small everyday amounts, duplicates likely.
    return [rng.randint(1, 100) for _ in range(n)]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    log = build_log(seed, n, rng)
    assert len(log) == n
    assert all(1 <= p <= MAX_P for p in log)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(p) for p in log))
    out.write("\n")


if __name__ == "__main__":
    main()
