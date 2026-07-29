"""Deterministic input generator for "Angry Professor".

Usage: python3 generator.py <seed>

Small seeds produce small inputs; large seeds push toward the constraint ceiling
(T = 100, N = 1000, arrivals spanning the full [-60, 60] range).
"""

import random
import sys

MAX_T = 100
MAX_N = 1000
MIN_ARRIVAL = -60
MAX_ARRIVAL = 60


def pick_scale(seed: int, rng: random.Random) -> tuple[int, int]:
    """Return (number of sessions, max roster size) for this seed."""
    if seed < 10:
        return rng.randint(1, 3), 6
    if seed < 1000:
        return rng.randint(2, 20), 60
    if seed < 100000:
        return rng.randint(20, 60), 300
    return MAX_T, MAX_N


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: generator.py <seed>")

    seed = int(sys.argv[1])
    rng = random.Random(seed)

    sessions, max_n = pick_scale(seed, rng)
    lines = [str(sessions)]

    for _ in range(sessions):
        n = rng.randint(1, max_n)
        k = rng.randint(1, n)

        # Mix of shapes so the data is not uniformly random: sometimes everyone is
        # punctual, sometimes nobody is, usually a blend near the quorum boundary.
        shape = rng.randint(0, 3)
        if shape == 0:
            arrivals = [rng.randint(MIN_ARRIVAL, 0) for _ in range(n)]
        elif shape == 1:
            arrivals = [rng.randint(1, MAX_ARRIVAL) for _ in range(n)]
        elif shape == 2:
            value = rng.randint(MIN_ARRIVAL, MAX_ARRIVAL)
            arrivals = [value] * n
        else:
            target = max(0, min(n, k + rng.randint(-1, 1)))
            arrivals = [rng.randint(MIN_ARRIVAL, 0) for _ in range(target)]
            arrivals += [rng.randint(1, MAX_ARRIVAL) for _ in range(n - target)]
            rng.shuffle(arrivals)

        lines.append(f"{n} {k}")
        lines.append(" ".join(str(a) for a in arrivals))

    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
