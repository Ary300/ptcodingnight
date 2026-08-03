"""Random input generator for 'Sum vs XOR'.

Usage: python3 generator.py <seed> > tests/NN.in

Deterministic: the same seed always prints the same input.

Seed layout:
  seeds 1-8     reserved degenerate / boundary / adversarial bit shapes
  seeds 9-99    small n
  seeds 100-999 medium n (random magnitude)
  seeds >= 1000 n near the constraint ceiling
"""

import random
import sys

MAX_N = 10**18

# 0101...01 over 60 bits (below the ceiling), and its shift 1010...10.
ALTERNATING_LOW = (4**30 - 1) // 3
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
        # All ones: 2^59 - 1. No zero bits, so the answer is 1 despite huge n.
        return 2**59 - 1
    if seed == 5:
        # A single set bit: 2^59. Every lower bit is zero; the largest answer.
        return 2**59
    if seed == 6:
        # Alternating bits starting with 0 at the top of each pair.
        return ALTERNATING_LOW
    if seed == 7:
        # Alternating bits, the complementary phase.
        return ALTERNATING_HIGH
    if seed == 8:
        # A power of ten: trailing zero bits without being a power of two.
        return 10**15

    if seed < 100:
        return rng.randint(0, 1000)
    if seed < 1000:
        return rng.randint(0, 10 ** rng.randint(4, 17))
    return rng.randint(10**17, MAX_N)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: generator.py <seed>")

    seed = int(sys.argv[1])
    n = build_case(seed)

    assert 0 <= n <= MAX_N

    sys.stdout.write(f"{n}\n")


if __name__ == "__main__":
    main()
