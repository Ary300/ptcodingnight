"""Gena Playing Hanoi -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed picks both the disc count (growing toward the
n = 10 ceiling as seeds grow) and the shape of the position, so the test set
covers the degenerate and adversarial cases, not just uniform noise:
already-solved towers, everything stacked on one wrong rod (the classic
worst case), the goal with only the largest disc astray (the true farthest
position from the goal), two-rod splits, and uniform random scatters. Any
assignment of discs to rods is a legal position, because each rod's discs
are implicitly stacked in size order.
"""

import random
import sys

MAX_N = 10
RODS = 4


def choose_n(seed: int, rng: random.Random) -> int:
    """Small seeds stay small; from seed 30 on, bias hard toward the ceiling."""
    if seed < 30:
        return max(1, min(MAX_N, (seed % MAX_N) + 1))
    return rng.randint(8, MAX_N)


def build_position(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 5

    if shape == 0:
        # Uniform scatter over all four rods.
        return [rng.randint(1, RODS) for _ in range(n)]

    if shape == 1:
        # Entire tower on a single rod (possibly already rod 1).
        rod = rng.randint(1, RODS)
        return [rod] * n

    if shape == 2:
        # Goal position except the largest disc, which sits elsewhere.
        # This is the farthest legal position from the goal.
        rod = rng.randint(2, RODS)
        return [1] * (n - 1) + [rod]

    if shape == 3:
        # Split across exactly two rods.
        a, b = rng.sample(range(1, RODS + 1), 2)
        pos = [a if rng.random() < 0.5 else b for _ in range(n)]
        pos[rng.randrange(n)] = b  # guarantee both rods are used when n > 1
        return pos

    # shape == 4: nearly solved, a few small discs scattered.
    pos = [1] * n
    astray = rng.randint(1, max(1, n // 2))
    for disc in rng.sample(range(n), astray):
        pos[disc] = rng.randint(2, RODS)
    return pos


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed, rng)
    pos = build_position(seed, n, rng)
    assert len(pos) == n
    assert all(1 <= r <= RODS for r in pos)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(r) for r in pos))
    out.write("\n")


if __name__ == "__main__":
    main()
