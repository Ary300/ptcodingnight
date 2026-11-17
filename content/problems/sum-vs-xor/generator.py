"""Random input generator for 'Sum vs XOR'.

Usage: python3 generator.py <seed> > tests/NN.in

Deterministic: the same seed always prints the same input.

Seed layout:
  seeds 1-8     reserved degenerate / boundary / adversarial bit shapes
  seeds 9-99    small n
  seeds 100-999 medium n (random magnitude)
  seeds >= 1000 n in the top decade below the constraint ceiling

The ceiling is 10^6, kept small on purpose so that the obvious loop over every
x in [0, n] finishes quickly and every value fits a signed 32-bit integer.

Which test came from where:
  01-03  the statement's examples, written by hand (10, 0, 7)
  04     seed 2 (n = 1)
  05-06  written by hand (n = 2, n = 3)
  07-11  seeds 4, 5, 6, 7, 8
  12     seed 9
  13     seed 42
  14-16  seeds 150, 500, 777
  17-18  seeds 1000, 1024
  19     written by hand (n = MAX_N - 1)
  20     seed 3 (n = MAX_N)
"""

import random
import sys

MAX_N = 10**6

# 0101...01 over 20 bits (below the ceiling), and its shift 1010...10.
ALTERNATING_LOW = (4**10 - 1) // 3
ALTERNATING_HIGH = 2 * ALTERNATING_LOW


def build_case(seed: int) -> int:
    rng = random.Random(seed)

    if seed == 1:
        # Minimum: n = 0, the explicitly worded edge.
        return 0
    if seed == 2:
        # Smallest positive n.
        return 1
    if seed == 3:
        # Maximum n allowed by the constraints.
        return MAX_N
    if seed == 4:
        # All ones: 2^19 - 1. No zero bits, so the answer is 1 despite large n.
        return 2**19 - 1
    if seed == 5:
        # A single set bit: 2^19. Every lower bit is zero; the largest answer.
        return 2**19
    if seed == 6:
        # Alternating bits starting with 0 at the top of each pair.
        return ALTERNATING_LOW
    if seed == 7:
        # Alternating bits, the complementary phase.
        return ALTERNATING_HIGH
    if seed == 8:
        # A power of ten: trailing zero bits without being a power of two.
        return 10**5

    if seed < 100:
        return rng.randint(0, 1000)
    if seed < 1000:
        return rng.randint(0, 10 ** rng.randint(3, 5))
    return rng.randint(10**5, MAX_N)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: generator.py <seed>")

    seed = int(sys.argv[1])
    n = build_case(seed)

    assert 0 <= n <= MAX_N

    sys.stdout.write(f"{n}\n")


if __name__ == "__main__":
    main()
