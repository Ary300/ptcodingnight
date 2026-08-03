"""Flipping bits -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed picks both the number of readings and the
shape of the values, so the test set covers the degenerate corners (all
zeros, all ones, single set bits, alternating masks, values pinned to the
constraint boundaries) as well as uniform noise up to the full 32-bit range.
"""

import random
import sys

MAX_Q = 100000
MAX_VALUE = 2**32 - 1

BOUNDARY_VALUES = [
    0,
    1,
    2,
    3,
    2**16 - 1,
    2**16,
    2**31 - 1,
    2**31,
    2**31 + 1,
    MAX_VALUE - 1,
    MAX_VALUE,
]

PATTERN_VALUES = [
    0x55555555,
    0xAAAAAAAA,
    0xFFFF0000,
    0x0000FFFF,
    0xF0F0F0F0,
    0x0F0F0F0F,
    0x80000001,
    0x7FFFFFFE,
]


def choose_q(seed: int) -> int:
    """Grow with the seed: tiny seeds give one reading, big seeds hit the cap."""
    return max(1, min(MAX_Q, seed * seed * seed))


def build_values(seed: int, q: int, rng: random.Random) -> list[int]:
    shape = seed % 7

    if shape == 0:
        # Uniform noise over the whole 32-bit range.
        return [rng.randint(0, MAX_VALUE) for _ in range(q)]

    if shape == 1:
        # Every reading identical.
        v = rng.randint(0, MAX_VALUE)
        return [v] * q

    if shape == 2:
        # Single set bits: each value is a power of two.
        return [1 << rng.randrange(32) for _ in range(q)]

    if shape == 3:
        # Constraint boundaries and alternating masks, cycled.
        pool = BOUNDARY_VALUES + PATTERN_VALUES
        return [pool[i % len(pool)] for i in range(q)]

    if shape == 4:
        # Sorted ascending noise.
        return sorted(rng.randint(0, MAX_VALUE) for _ in range(q))

    if shape == 5:
        # Sorted descending noise.
        return sorted((rng.randint(0, MAX_VALUE) for _ in range(q)), reverse=True)

    # shape == 6: complementary pairs, so outputs mirror inputs.
    values = []
    while len(values) < q:
        v = rng.randint(0, MAX_VALUE)
        values.append(v)
        if len(values) < q:
            values.append(v ^ MAX_VALUE)
    return values


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    q = choose_q(seed)
    values = build_values(seed, q, rng)
    assert len(values) == q
    assert all(0 <= v <= MAX_VALUE for v in values)
    out = sys.stdout
    out.write(f"{q}\n")
    out.write("\n".join(str(v) for v in values))
    out.write("\n")


if __name__ == "__main__":
    main()
