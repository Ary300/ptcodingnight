"""Deterministic random input generator.

Usage: python3 generator.py <seed>

Small seeds produce small catwalks; large seeds push toward the constraint
ceiling of n = 200000. The tape density also varies with the seed, so some
cases are wide open and some are as dense as the "no two adjacent taped
panels" rule allows.
"""

import random
import sys

MAX_N = 200000


def choose_n(seed: int, rng: random.Random) -> int:
    if seed < 10:
        return rng.randint(2, 12)
    if seed < 100:
        return rng.randint(13, 500)
    if seed < 1000:
        return rng.randint(500, 20000)
    if seed < 10000:
        return rng.randint(20000, 120000)
    return rng.randint(MAX_N - 50, MAX_N)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: generator.py <seed>")
    seed = int(sys.argv[1])
    rng = random.Random(seed)

    n = choose_n(seed, rng)
    density = rng.choice([0.0, 0.1, 0.25, 0.4, 0.5, 0.75, 1.0])

    panels = [0] * n
    # Interior panels only; the two ends must stay safe. A panel may be taped
    # only when the panel before it is safe, which keeps taped panels apart.
    for i in range(1, n - 1):
        if panels[i - 1] == 0 and rng.random() < density:
            panels[i] = 1

    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(p) for p in panels))
    out.write("\n")


if __name__ == "__main__":
    main()
