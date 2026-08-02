"""Random input generator for 'Simple Array Sum'.

Usage: python3 generator.py <seed> > tests/NN.in

Deterministic: the same seed always prints the same input.

Seed layout:
  seeds 1-9     reserved degenerate / boundary shapes
  seeds 10-99   small inputs
  seeds 100-999 medium inputs
  seeds >= 1000 inputs at the constraint ceiling
"""

import random
import sys

MAX_N = 100_000
MAX_VALUE = 1000


def build_case(seed: int) -> tuple[int, list[int]]:
    rng = random.Random(seed)

    if seed == 1:
        # Minimum everything: one entry, zero crates.
        return 1, [0]
    if seed == 2:
        # One entry at the value ceiling.
        return 1, [MAX_VALUE]
    if seed == 3:
        # Both value bounds in a single tiny input.
        return 2, [0, MAX_VALUE]
    if seed == 4:
        # All entries equal, away from the boundaries.
        n = rng.randint(2, 500)
        value = rng.randint(1, MAX_VALUE - 1)
        return n, [value] * n
    if seed == 5:
        # Sorted ascending, duplicates allowed.
        n = rng.randint(20, 200)
        return n, sorted(rng.randint(0, MAX_VALUE) for _ in range(n))
    if seed == 6:
        # Sorted descending.
        n = rng.randint(20, 200)
        return n, sorted((rng.randint(0, MAX_VALUE) for _ in range(n)), reverse=True)
    if seed == 7:
        # Heavy duplication: only a handful of distinct values.
        n = rng.randint(100, 2_000)
        palette = [rng.randint(0, MAX_VALUE) for _ in range(3)]
        return n, [rng.choice(palette) for _ in range(n)]
    if seed == 8:
        # A long run of zeros: large n, smallest possible answer.
        return 1_000, [0] * 1_000
    if seed == 9:
        # Maximum everything: the largest possible answer, 10^8.
        return MAX_N, [MAX_VALUE] * MAX_N

    if seed < 100:
        n = rng.randint(1, 15)
        ceiling = rng.choice([1, 10, 100, MAX_VALUE])
    elif seed < 1000:
        n = rng.randint(50, 5_000)
        ceiling = rng.choice([100, MAX_VALUE])
    else:
        n = rng.randint(MAX_N - 500, MAX_N)
        ceiling = MAX_VALUE

    values = [rng.randint(0, ceiling) for _ in range(n)]
    return n, values


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: generator.py <seed>")

    seed = int(sys.argv[1])
    n, values = build_case(seed)

    assert 1 <= n <= MAX_N
    assert all(0 <= v <= MAX_VALUE for v in values)
    assert len(values) == n

    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(v) for v in values))
    out.write("\n")


if __name__ == "__main__":
    main()
