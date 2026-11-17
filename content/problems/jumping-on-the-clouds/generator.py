"""Deterministic random input generator.

Usage: python3 generator.py <seed>

Small seeds produce small catwalks; large seeds push toward the constraint
ceiling of n = 1000. The ceiling is kept moderate on purpose, so the largest
input stays a couple of kilobytes and the answer stays small. The tape density
also varies with the seed, so some cases are wide open and some are as dense as
the "no two adjacent taped panels" rule allows.

Tests 01-10 are hand-written (01-02 are the statement samples):

    01  n = 7, the first sample
    02  n = 4, the second sample
    03  n = 2, the smallest catwalk, one step
    04  n = 3, one taped panel in the middle, one hop
    05  n = 1000, nothing taped, every move a hop
    06  n = 999, every other panel taped, odd length
    07  n = 1000, every other panel taped up to panel 996, then four safe panels
    08  n = 400, every other panel taped for the first half, open after that
    09  n = 5, a single taped panel
    10  the first sample again

Seeds behind the generated tests:

    11  seed 42       small tier (13-200 panels)
    12  seed 137      middle tier (200-500 panels)
    13  seed 909      middle tier (200-500 panels)
    14  seed 4242     upper tier (500-900 panels)
    15  seed 10022    ceiling tier, density 1.0, as dense as the rules allow
    16  seed 99999    ceiling tier, mixed density
"""

import random
import sys

MAX_N = 1000


def choose_n(seed: int, rng: random.Random) -> int:
    if seed < 10:
        return rng.randint(2, 12)
    if seed < 100:
        return rng.randint(13, 200)
    if seed < 1000:
        return rng.randint(200, 500)
    if seed < 10000:
        return rng.randint(500, 900)
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
