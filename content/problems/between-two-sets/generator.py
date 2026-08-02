"""Between Two Sets -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed selects a shape so the test set covers the
degenerate corners (single-element lists, all-equal lists, divisor-rich b,
lcm(a) far above every b, forced-nonzero answers, sorted and reverse-sorted
lists) as well as uniform noise, and not just random values.
"""

import random
import sys

MAX_N = 10
MAX_V = 100


def build_case(seed: int, rng: random.Random) -> tuple[list[int], list[int]]:
    shape = seed % 7

    if shape == 0:
        # Uniform noise across the whole constraint box.
        n = rng.randint(1, MAX_N)
        m = rng.randint(1, MAX_N)
        return (
            [rng.randint(1, MAX_V) for _ in range(n)],
            [rng.randint(1, MAX_V) for _ in range(m)],
        )

    if shape == 1:
        # Guaranteed nonzero answer: a divides base, b is multiples of base.
        base = rng.choice([2, 3, 4, 6, 8, 12])
        n = rng.randint(1, MAX_N)
        m = rng.randint(1, MAX_N)
        divisors = [d for d in range(1, base + 1) if base % d == 0]
        a = [rng.choice(divisors) for _ in range(n)]
        b = [base * rng.randint(1, MAX_V // base) for _ in range(m)]
        return a, b

    if shape == 2:
        # Every value identical in both lists.
        v = rng.randint(1, MAX_V)
        return [v] * rng.randint(1, MAX_N), [v] * rng.randint(1, MAX_N)

    if shape == 3:
        # Divisor-rich: a is all ones, b is copies of a highly divisible value.
        v = rng.choice([60, 72, 84, 90, 96, 100])
        return [1] * rng.randint(1, MAX_N), [v] * rng.randint(1, MAX_N)

    if shape == 4:
        # Forced zero: a contains a large prime that divides nothing in b.
        p = rng.choice([53, 59, 61, 67, 71, 73, 79, 83, 89, 97])
        n = rng.randint(1, MAX_N)
        a = [p] + [rng.randint(1, MAX_V) for _ in range(n - 1)]
        rng.shuffle(a)
        b = [rng.randint(1, p - 1) for _ in range(rng.randint(1, MAX_N))]
        return a, b

    if shape == 5:
        # Sorted ascending a, reverse-sorted b.
        a = sorted(rng.randint(1, MAX_V) for _ in range(rng.randint(1, MAX_N)))
        b = sorted(
            (rng.randint(1, MAX_V) for _ in range(rng.randint(1, MAX_N))),
            reverse=True,
        )
        return a, b

    # shape == 6: both lists at maximum length, values near the ceiling.
    return (
        [rng.randint(MAX_V - 10, MAX_V) for _ in range(MAX_N)],
        [rng.randint(MAX_V - 10, MAX_V) for _ in range(MAX_N)],
    )


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    a, b = build_case(seed, rng)
    assert 1 <= len(a) <= MAX_N and 1 <= len(b) <= MAX_N
    assert all(1 <= v <= MAX_V for v in a + b)
    out = sys.stdout
    out.write(f"{len(a)} {len(b)}\n")
    out.write(" ".join(str(v) for v in a) + "\n")
    out.write(" ".join(str(v) for v in b) + "\n")


if __name__ == "__main__":
    main()
