"""Random input generator for "Cats and a Mouse".

Usage: python3 generator.py <seed> > case.in
       python3 generator.py <mode> <seed> > case.in    (mode: zeros, extremes, ties)

Deterministic per seed. Small seeds produce tiny inputs; large seeds produce the
largest random tier (750 chases, marks within +-10^6). The ceiling is kept moderate
on purpose so the largest input stays under about 20 KB. Marks may reach +-10^9 (the
second sample does), and the largest distance |p - m| is then 2 * 10^9, which still
fits a signed 32-bit int.

The modes rebuild the edge-case tests:

    zeros     every chase is "0 0 0", MAX_Q of them
    extremes  every mark drawn from {-10^9, -10^9 + 1, -1, 0, 1, 10^9 - 1, 10^9}
    ties      every chase is a tie at full range (Pixel and Byte mirror the mouse)

Seeds behind the committed tests (01-02 are the statement samples, 10 is
hand-written: both cats share a mark at one end of the tape, the mouse at the other):

    03  seed 3              tiny tier
    04  seed 7              tiny tier
    05  seed 42             small tier (marks within +-1000)
    06  seed 137            middle tier (marks within +-10^6)
    07  seed 999            middle tier
    08  seed 4242           ceiling tier, half the chases forced to tie
    09  seed 5008           ceiling tier, no forced ties
    11  zeros 0             1000 chases, all three marks at 0
    12  extremes 12         800 chases on the boundary values
    13  ties 13             600 ties spread over the full +-10^9 range
"""

import random
import sys

MAX_Q = 1000
MAX_COORD = 10 ** 9
EXTREME_MARKS = (-MAX_COORD, -MAX_COORD + 1, -1, 0, 1, MAX_COORD - 1, MAX_COORD)


def size_for_seed(seed: int) -> tuple[int, int]:
    """Return (number of chases, coordinate limit) for this seed."""
    if seed <= 10:
        return (1 + seed % 5, 9)
    if seed <= 100:
        return (10 + seed % 51, 1000)
    if seed <= 1000:
        return (200 + seed % 501, 10 ** 6)
    return (750, 10 ** 6)


def build_line(rng: random.Random, limit: int, tie_rate: float) -> tuple[int, int, int]:
    mouse = rng.randint(-limit, limit)
    if rng.random() < tie_rate:
        reach = min(mouse + limit, limit - mouse)
        distance = rng.randint(0, reach) if reach > 0 else 0
        return (mouse - distance, mouse + distance, mouse)
    return (rng.randint(-limit, limit), rng.randint(-limit, limit), mouse)


def random_case(seed: int) -> list[tuple[int, int, int]]:
    rng = random.Random(seed)
    chases, limit = size_for_seed(seed)
    tie_rate = rng.choice([0.0, 0.05, 0.2, 0.5])
    return [build_line(rng, limit, tie_rate) for _ in range(chases)]


def zeros_case(_seed: int) -> list[tuple[int, int, int]]:
    return [(0, 0, 0)] * MAX_Q


def extremes_case(seed: int) -> list[tuple[int, int, int]]:
    rng = random.Random(seed)
    return [
        (rng.choice(EXTREME_MARKS), rng.choice(EXTREME_MARKS), rng.choice(EXTREME_MARKS))
        for _ in range(800)
    ]


def ties_case(seed: int) -> list[tuple[int, int, int]]:
    rng = random.Random(seed)
    return [build_line(rng, MAX_COORD, 1.0) for _ in range(600)]


MODES = {"zeros": zeros_case, "extremes": extremes_case, "ties": ties_case}


def main() -> None:
    if len(sys.argv) == 2:
        chases = random_case(int(sys.argv[1]))
    elif len(sys.argv) == 3 and sys.argv[1] in MODES:
        chases = MODES[sys.argv[1]](int(sys.argv[2]))
    else:
        raise SystemExit("usage: generator.py <seed> | generator.py <zeros|extremes|ties> <seed>")

    lines = [str(len(chases))]
    for pixel, byte, mouse in chases:
        lines.append(f"{pixel} {byte} {mouse}")
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
