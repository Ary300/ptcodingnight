"""Grading Students -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short grade lists; large seeds push
n toward the constraint ceiling. The seed also selects a shape so the test set
covers the decision boundaries (grades 36 through 45, exact multiples of 5,
everything below the rounding floor) and not just uniform noise.
"""

import random
import sys

MAX_N = 100000
MAX_GRADE = 100


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 grade, seed >= 317 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_grades(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 7

    if shape == 0:
        # Uniform noise over the whole grade range.
        return [rng.randint(0, MAX_GRADE) for _ in range(n)]

    if shape == 1:
        # Every grade identical.
        g = rng.randint(0, MAX_GRADE)
        return [g] * n

    if shape == 2:
        # Cluster around the 38 floor and nearby multiples of 5: the zone
        # where every off-by-one in the rules changes the answer.
        return [rng.randint(33, 47) for _ in range(n)]

    if shape == 3:
        # Only multiples of 5: nothing should ever move.
        return [5 * rng.randint(0, MAX_GRADE // 5) for _ in range(n)]

    if shape == 4:
        # Grades ending in 3 or 4 above the floor: everything rounds up.
        return [5 * rng.randint(8, 19) + rng.choice([3, 4]) for _ in range(n)]

    if shape == 5:
        # Everything below the rounding floor: nothing rounds.
        return [rng.randint(0, 37) for _ in range(n)]

    # shape == 6: a full sweep 0..100 repeated, so every residue appears.
    return [(i % (MAX_GRADE + 1)) for i in range(n)]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    grades = build_grades(seed, n, rng)
    assert len(grades) == n
    assert all(0 <= g <= MAX_GRADE for g in grades)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write("\n".join(str(g) for g in grades))
    out.write("\n")


if __name__ == "__main__":
    main()
