"""Migratory Birds -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny logs; large seeds push n to the
constraint ceiling. The seed also selects the shape of the log so that the test
set covers degenerate cases (single sighting, one species only, forced ties,
perfectly flat distributions) and not just uniform noise.

The ceiling is a moderate 1000 sightings: this is a casual contest, and the
point of the large tests is the tie-break and the counting, not the time limit.

Which seed made which test (01 and 02 are the hand-written samples):

    03 <- seed 1    n=1     single sighting
    04 <- seed 2    n=4     forced tie
    05 <- seed 3    n=9     flat, every code once
    06 <- seed 4    n=16    one dominant species
    07 <- seed 6    n=36    one species only
    08 <- seed 23   n=529   flat, many codes tie at the top
    09 <- seed 25   n=625   uniform noise
    10 <- seed 27   n=729   forced tie
    11 <- seed 32   n=1000  forced tie at the ceiling
    12 <- seed 33   n=1000  flat at the ceiling
    13 <- seed 35   n=1000  uniform noise at the ceiling
    14 <- seed 34   n=1000  one dominant species at the ceiling
"""

import random
import sys

MAX_N = 1000
MAX_CODE = 50


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 sighting, seed >= 32 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_log(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 5

    if shape == 0:
        # Uniform noise over the full code range.
        return [rng.randint(1, MAX_CODE) for _ in range(n)]

    if shape == 1:
        # Every sighting is the same species.
        code = rng.randint(1, MAX_CODE)
        return [code] * n

    if shape == 2:
        # Forced tie between two randomly chosen codes, padded with rarer codes.
        a, b = rng.sample(range(1, MAX_CODE + 1), 2)
        each = (n - n // 4) // 2
        log = [a] * each + [b] * each
        others = [c for c in range(1, MAX_CODE + 1) if c not in (a, b)]
        for i in range(n - len(log)):
            log.append(others[i % len(others)])
        rng.shuffle(log)
        return log

    if shape == 3:
        # Perfectly flat: codes cycle, so many species tie at the top.
        distinct = min(n, MAX_CODE)
        return [(i % distinct) + 1 for i in range(n)]

    # shape == 4: one dominant species buried in a long tail.
    winner = rng.randint(1, MAX_CODE)
    log = []
    for _ in range(n):
        if rng.random() < 0.6:
            log.append(winner)
        else:
            log.append(rng.randint(1, MAX_CODE))
    rng.shuffle(log)
    return log


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    log = build_log(seed, n, rng)
    assert len(log) == n
    assert all(1 <= c <= MAX_CODE for c in log)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(c) for c in log))
    out.write("\n")


if __name__ == "__main__":
    main()
