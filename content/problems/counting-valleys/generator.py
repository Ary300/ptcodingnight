"""Counting Valleys -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short walks; large seeds push n to
the constraint ceiling. The seed also selects the shape of the walk so the test
set covers adversarial cases (one bottomless valley, a pure sawtooth of unit
valleys, long excursions that hug sea level, hills only) and not just uniform
shuffles. Every emitted walk has equal counts of U and D, as the statement
guarantees.
"""

import random
import sys

MAX_N = 1_000_000


def choose_n(seed: int, rng: random.Random) -> int:
    """Grow with the seed: tiny walks first, the ceiling from seed >= 1000."""
    if seed >= 1000:
        return MAX_N
    raw = max(2, min(MAX_N, seed * seed))
    return raw if raw % 2 == 0 else raw + 1


def build_walk(seed: int, n: int, rng: random.Random) -> str:
    half = n // 2
    shape = seed % 6

    if shape == 0:
        # Uniform shuffle of half U's and half D's.
        steps = ["U"] * half + ["D"] * half
        rng.shuffle(steps)
        return "".join(steps)

    if shape == 1:
        # One valley as deep as the walk allows.
        return "D" * half + "U" * half

    if shape == 2:
        # Hills only: the answer is zero no matter how long the walk is.
        return "U" * half + "D" * half

    if shape == 3:
        # Sawtooth of unit valleys: the maximum possible answer, n/2.
        return "DU" * half

    if shape == 4:
        # Sawtooth of unit hills: touches sea level constantly, answer zero.
        return "UD" * half

    # shape == 5: random blocks that alternate valley and hill excursions,
    # each of random even width, so the walk crosses sea level many times at
    # irregular intervals.
    parts: list[str] = []
    remaining = half
    below = rng.random() < 0.5
    while remaining > 0:
        width = rng.randint(1, max(1, min(remaining, half // 8 + 1)))
        down, up = "D" * width, "U" * width
        parts.append(down + up if below else up + down)
        remaining -= width
        below = not below
    return "".join(parts)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed, rng)
    walk = build_walk(seed, n, rng)
    assert len(walk) == n
    assert walk.count("U") == walk.count("D") == n // 2
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(walk)
    out.write("\n")


if __name__ == "__main__":
    main()
