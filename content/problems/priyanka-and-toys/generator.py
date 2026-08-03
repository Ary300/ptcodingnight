"""Priyanka and Toys -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Seeds 1 through 10 produce fixed edge shapes (single
toy at each weight bound, all weights equal, chains spaced exactly at and just
past the crate width, pre-sorted and reverse-sorted input, heavy duplicates,
distant clusters, values pinned to the constraint bounds). Seeds above 10 grow
n roughly with the square of the seed and rotate through random families, and
seeds 900+ force n to the ceiling: 900 is the adversarial maximum-crate-count
input, 901+ are uniform noise at full size.
"""

import random
import sys

MAX_N = 100000
MAX_W = 10000
WIDTH = 4  # a crate at base w holds weights w .. w + WIDTH


def edge_case(seed: int, rng: random.Random) -> list[int]:
    if seed == 1:
        return [0]
    if seed == 2:
        return [MAX_W]
    if seed == 3:
        # Every toy weighs the same.
        return [rng.randint(0, MAX_W)] * 60
    if seed == 4:
        # Chain spaced exactly WIDTH apart: consecutive pairs share a crate.
        start = rng.randint(0, 20)
        return [start + i * WIDTH for i in range(40)]
    if seed == 5:
        # Chain spaced WIDTH + 1 apart: every toy needs its own crate.
        start = rng.randint(0, 20)
        return [start + i * (WIDTH + 1) for i in range(40)]
    if seed == 6:
        # Already sorted ascending.
        return sorted(rng.randint(0, 500) for _ in range(200))
    if seed == 7:
        # Reverse sorted.
        return sorted((rng.randint(0, 500) for _ in range(200)), reverse=True)
    if seed == 8:
        # Heavy duplicates in a narrow band.
        band = rng.randint(0, MAX_W - 12)
        return [rng.randint(band, band + 12) for _ in range(500)]
    if seed == 9:
        # Two clusters far apart.
        low = [rng.randint(0, 30) for _ in range(150)]
        high = [rng.randint(MAX_W - 30, MAX_W) for _ in range(150)]
        both = low + high
        rng.shuffle(both)
        return both
    # seed == 10: values pinned to and near both constraint bounds.
    pool = [0, 1, WIDTH, WIDTH + 1, MAX_W - WIDTH - 1, MAX_W - WIDTH, MAX_W - 1, MAX_W]
    return [rng.choice(pool) for _ in range(300)]


def random_case(seed: int, rng: random.Random) -> list[int]:
    if seed == 900:
        # Adversarial: as many crates as the weight range allows, at full n.
        distinct = [v for v in range(0, MAX_W + 1, WIDTH + 1)]
        toys = [distinct[i % len(distinct)] for i in range(MAX_N)]
        rng.shuffle(toys)
        return toys
    if seed >= 901:
        # Uniform noise at the size ceiling.
        return [rng.randint(0, MAX_W) for _ in range(MAX_N)]

    n = max(1, min(MAX_N, seed * seed))
    family = seed % 3
    if family == 0:
        # Uniform over the full weight range.
        return [rng.randint(0, MAX_W) for _ in range(n)]
    if family == 1:
        # Clumpy: a few dense clusters of random width.
        centers = [rng.randint(0, MAX_W) for _ in range(rng.randint(1, 8))]
        return [
            min(MAX_W, max(0, rng.choice(centers) + rng.randint(-6, 6)))
            for _ in range(n)
        ]
    # family == 2: small weight range, lots of collisions.
    return [rng.randint(0, 40) for _ in range(n)]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    toys = edge_case(seed, rng) if seed <= 10 else random_case(seed, rng)
    assert 1 <= len(toys) <= MAX_N
    assert all(0 <= w <= MAX_W for w in toys)
    out = sys.stdout
    out.write(f"{len(toys)}\n")
    out.write(" ".join(str(w) for w in toys))
    out.write("\n")


if __name__ == "__main__":
    main()
