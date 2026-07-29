"""Migratory Birds -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny logs; large seeds push n to the
constraint ceiling. The seed also selects the shape of the log so that the test
set covers degenerate cases (single sighting, one species only, forced ties,
perfectly flat distributions) and not just uniform noise.
"""

import random
import sys

MAX_N = 200000
MAX_CODE = 50


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 sighting, seed >= 448 -> the ceiling."""
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
