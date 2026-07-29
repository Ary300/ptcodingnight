"""Random input generator for "Cats and a Mouse".

Usage: python3 generator.py <seed> > case.in

Deterministic per seed. Small seeds produce tiny inputs; large seeds push the
input to the constraint ceiling.
"""

import random
import sys

MAX_Q = 20000
MAX_COORD = 10 ** 9


def size_for_seed(seed: int) -> tuple[int, int]:
    """Return (number of chases, coordinate limit) for this seed."""
    if seed <= 10:
        return (1 + seed % 5, 9)
    if seed <= 100:
        return (10 + seed % 51, 1000)
    if seed <= 1000:
        return (500 + seed % 2501, 10 ** 6)
    return (MAX_Q, MAX_COORD)


def build_line(rng: random.Random, limit: int, tie_rate: float) -> tuple[int, int, int]:
    mouse = rng.randint(-limit, limit)
    if rng.random() < tie_rate:
        reach = min(mouse + limit, limit - mouse)
        distance = rng.randint(0, reach) if reach > 0 else 0
        return (mouse - distance, mouse + distance, mouse)
    return (rng.randint(-limit, limit), rng.randint(-limit, limit), mouse)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: generator.py <seed>")
    seed = int(sys.argv[1])
    rng = random.Random(seed)

    chases, limit = size_for_seed(seed)
    tie_rate = rng.choice([0.0, 0.05, 0.2, 0.5])

    lines = [str(chases)]
    for _ in range(chases):
        pixel, byte, mouse = build_line(rng, limit, tie_rate)
        lines.append(f"{pixel} {byte} {mouse}")
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
