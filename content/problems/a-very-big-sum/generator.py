"""Random input generator for 'A Very Big Sum'.

Usage: python3 generator.py <seed> > tests/NN.in

Deterministic: the same seed always prints the same input.

Seed layout:
  seeds 1-4    reserved degenerate / boundary shapes
  seeds 5-99   small inputs
  seeds 100-999 medium inputs
  seeds >= 1000 inputs at the constraint ceiling
"""

import random
import sys

MAX_N = 100_000
MAX_VALUE = 10 ** 12


def build_case(seed: int) -> tuple[int, list[int]]:
    rng = random.Random(seed)

    if seed == 1:
        # Minimum everything: one session, one tick.
        return 1, [1]
    if seed == 2:
        # Maximum everything: the largest possible answer.
        return MAX_N, [MAX_VALUE] * MAX_N
    if seed == 3:
        # All values equal, but not at a boundary.
        n = rng.randint(2, MAX_N)
        value = rng.randint(2, MAX_VALUE - 1)
        return n, [value] * n
    if seed == 4:
        # Many sessions, all minimal — the answer stays small despite a huge n.
        return MAX_N, [1] * MAX_N

    if seed < 100:
        n = rng.randint(1, 12)
        ceiling = 10 ** rng.randint(1, 6)
    elif seed < 1000:
        n = rng.randint(50, 5_000)
        ceiling = 10 ** rng.randint(6, 12)
    else:
        n = rng.randint(MAX_N - 500, MAX_N)
        ceiling = MAX_VALUE

    values = [rng.randint(1, ceiling) for _ in range(n)]
    return n, values


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: generator.py <seed>")

    seed = int(sys.argv[1])
    n, values = build_case(seed)

    assert 1 <= n <= MAX_N
    assert all(1 <= v <= MAX_VALUE for v in values)
    assert len(values) == n

    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(v) for v in values))
    out.write("\n")


if __name__ == "__main__":
    main()
