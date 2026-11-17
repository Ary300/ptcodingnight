"""Larry's Array -- input generator.

Usage: python3 generator.py <seed>
       python3 generator.py fixed <name>

Deterministic per seed. Small seeds produce tiny inputs; large seeds push the
total shelf length toward the constraint ceiling. Each shelf's shape is drawn
from a mix that covers uniform random permutations, the identity, the reversal,
the identity scrambled by k transpositions (which pins the parity to k), the
identity scrambled by legal 3-rotations only (always sortable), and a single
adjacent swap (never sortable). Random shuffles alone would answer YES and NO
in near-equal measure but would almost never produce the structured shapes.

The ceiling is kept moderate on purpose (n up to 1,000, at most 4,000 crates per
input) so the largest input stays under about 20 KB and a student who counts
inversions with a plain double loop still finishes well inside the time limit.

The "fixed" form builds the structured large tests, each at the ceiling shelf size.

Inputs behind the committed tests (01-02 are the statement samples, 04-06 are
hand-written: n = 2, and every permutation of 3 and of 4):

    03  seed 1               a single shelf of one crate
    07  fixed identity       one sorted shelf of 1,000 crates
    08  fixed reversals      the reversal of 1,000 (even, YES) and of 999 (odd, NO)
    09  fixed near-sorted    1,000 crates with one adjacent swap at the end, with the
                             ends swapped, and with one 3-rotation in the middle
    10  seed 2               six tiny shelves
    11  seed 5               small tier
    12  seed 9               middle tier, 729 crates in all
    13  seed 17              ceiling tier
    14  seed 31              ceiling tier
    15  seed 48              ceiling tier
    16  seed 62              ceiling tier
    17  fixed every-shape    30 shelves of 128 crates, every shape five times in turn
    18  fixed random-large   three uniform random shelves of 1,000 crates
"""

import random
import sys

MAX_N = 1000
MAX_TOTAL = 4000
MAX_Q = 30


def choose_total(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 element, seed >= 16 -> the ceiling."""
    return max(1, min(MAX_TOTAL, seed ** 3))


def build_shelf(rng: random.Random, n: int, shape: int | None = None) -> list[int]:
    perm = list(range(1, n + 1))
    if shape is None:
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


def fixed_shelves(name: str) -> list[list[int]]:
    """The structured large tests, built at the ceiling shelf size."""
    n = MAX_N
    identity = list(range(1, n + 1))

    if name == "identity":
        return [identity]

    if name == "reversals":
        return [identity[::-1], list(range(n - 1, 0, -1))]

    if name == "near-sorted":
        tail_swap = identity[:-2] + [n, n - 1]
        ends_swap = [n] + identity[1:-1] + [1]
        rotated = identity[:500] + [502, 503, 501] + identity[503:]
        return [tail_swap, ends_swap, rotated]

    if name == "every-shape":
        rng = random.Random(17)
        return [build_shelf(rng, 128, shape=i % 6) for i in range(MAX_Q)]

    if name == "random-large":
        rng = random.Random(18)
        return [build_shelf(rng, n, shape=0) for _ in range(3)]

    raise SystemExit(f"unknown fixed test: {name}")


def seeded_shelves(seed: int) -> list[list[int]]:
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

    return [build_shelf(rng, n) for n in sizes]


def main() -> None:
    if len(sys.argv) == 3 and sys.argv[1] == "fixed":
        shelves = fixed_shelves(sys.argv[2])
    elif len(sys.argv) == 2:
        shelves = seeded_shelves(int(sys.argv[1]))
    else:
        raise SystemExit("usage: generator.py <seed> | generator.py fixed <name>")

    lines = [str(len(shelves))]
    for shelf in shelves:
        n = len(shelf)
        assert 1 <= n <= MAX_N
        assert sorted(shelf) == list(range(1, n + 1))
        lines.append(str(n))
        lines.append(" ".join(str(x) for x in shelf))

    assert 1 <= len(shelves) <= MAX_Q
    assert sum(len(s) for s in shelves) <= MAX_TOTAL
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
