"""Maximizing XOR -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed selects a shape so the test set covers the
degenerate and adversarial cases (l == r, adjacent values, a range hugging a
power-of-two boundary, the full constraint span) and not just uniform noise.
"""

import random
import sys

MAX_V = 1000


def build_case(seed: int, rng: random.Random) -> tuple[int, int]:
    shape = seed % 5

    if shape == 0:
        # Degenerate range: l == r, so the answer is 0.
        v = rng.randint(1, MAX_V)
        return v, v

    if shape == 1:
        # Adjacent values.
        l = rng.randint(1, MAX_V - 1)
        return l, l + 1

    if shape == 2:
        # Range straddling a power-of-two boundary: maximal answer for its width.
        k = rng.randint(1, 9)
        boundary = 1 << k
        l = max(1, boundary - rng.randint(1, boundary // 2))
        r = min(MAX_V, boundary + rng.randint(0, boundary // 2))
        return l, r

    if shape == 3:
        # Range entirely below a power of two: shared high bits never contribute.
        k = rng.randint(2, 9)
        hi = min(MAX_V, (1 << k) - 1)
        l = rng.randint(hi // 2 + 1, hi)
        r = rng.randint(l, hi)
        return l, r

    # shape == 4: uniform over the whole constraint space.
    a = rng.randint(1, MAX_V)
    b = rng.randint(1, MAX_V)
    return min(a, b), max(a, b)


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    l, r = build_case(seed, rng)
    assert 1 <= l <= r <= MAX_V
    sys.stdout.write(f"{l} {r}\n")


if __name__ == "__main__":
    main()
