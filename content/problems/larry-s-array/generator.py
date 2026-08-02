"""Larry's Array -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny inputs; large seeds push the
total shelf length toward the constraint ceiling. Each shelf's shape is drawn
from a mix that covers uniform random permutations, the identity, the reversal,
the identity scrambled by k transpositions (which pins the parity to k), the
identity scrambled by legal 3-rotations only (always sortable), and a single
adjacent swap (never sortable). Random shuffles alone would answer YES and NO
in near-equal measure but would almost never produce the structured shapes.
"""

import random
import sys

MAX_N = 100000
MAX_TOTAL = 300000
MAX_Q = 30


def choose_total(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 element, seed >= 67 -> the ceiling."""
    return max(1, min(MAX_TOTAL, seed ** 3))


def build_shelf(rng: random.Random, n: int) -> list[int]:
    perm = list(range(1, n + 1))
    shape = rng.randrange(6)

    if shape == 0:
        rng.shuffle(perm)
        return perm

    if shape == 1:
        return perm  # already sorted

    if shape == 2:
        return perm[::-1]

    if shape == 3:
        # k transpositions: the permutation's parity equals the parity of k.
        k = rng.randint(1, max(1, min(n, 50)))
        for _ in range(k):
            i = rng.randrange(n)
            j = rng.randrange(n)
            perm[i], perm[j] = perm[j], perm[i]
        return perm

    if shape == 4:
        # Legal rotations only, so the shelf is always sortable.
        if n >= 3:
            for _ in range(rng.randint(1, 3 * n)):
                i = rng.randrange(n - 2)
                perm[i], perm[i + 1], perm[i + 2] = perm[i + 1], perm[i + 2], perm[i]
        return perm

    # shape == 5: one adjacent swap, so the shelf is never sortable (n >= 2).
    if n >= 2:
        i = rng.randrange(n - 1)
        perm[i], perm[i + 1] = perm[i + 1], perm[i]
    return perm


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    total = choose_total(seed)

    sizes: list[int] = []
    remaining = total
    while remaining > 0 and len(sizes) < MAX_Q:
        if len(sizes) == MAX_Q - 1:
            n = min(remaining, MAX_N)
        else:
            n = rng.randint(1, min(remaining, MAX_N))
        sizes.append(n)
        remaining -= n

    lines = [str(len(sizes))]
    for n in sizes:
        shelf = build_shelf(rng, n)
        assert sorted(shelf) == list(range(1, n + 1))
        lines.append(str(n))
        lines.append(" ".join(str(x) for x in shelf))

    assert 1 <= len(sizes) <= MAX_Q
    assert sum(sizes) <= MAX_TOTAL
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
