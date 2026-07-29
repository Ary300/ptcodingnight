"""Deterministic input generator.

Usage: python3 generator.py <seed> > tests/NN.in

Small seeds produce small inputs; large seeds push q and the values toward the
constraint ceiling (q = 100, b = 10^9).
"""

import math
import random
import sys

MAX_Q = 100
MAX_V = 10 ** 9
SCALE_SEED = 5000.0


def size_fraction(seed: int) -> float:
    """0.0 for tiny seeds, 1.0 once the seed reaches SCALE_SEED."""
    return min(1.0, max(0.0, seed / SCALE_SEED))


def pick_range(rng: random.Random, hi: int) -> tuple[int, int]:
    """Pick 1 <= a <= b <= hi, often hugging a perfect-square boundary."""
    style = rng.randint(0, 3)
    root_max = math.isqrt(hi)
    if style == 0 and root_max >= 2:
        # A range that starts or ends right next to a perfect square.
        k = rng.randint(1, root_max)
        square = k * k
        a = min(hi, max(1, square + rng.randint(-1, 1)))
        b = min(hi, a + rng.randint(0, max(1, hi // 100)))
    elif style == 1:
        # A very short range (often a single value).
        a = rng.randint(1, hi)
        b = min(hi, a + rng.randint(0, 2))
    else:
        # A plain random range.
        a = rng.randint(1, hi)
        b = rng.randint(a, hi)
    return a, b


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)

    frac = size_fraction(seed)
    q_cap = max(1, round(1 + (MAX_Q - 1) * frac))
    q = rng.randint(1, q_cap)
    hi = max(1, min(MAX_V, int(10 ** (1 + 8 * frac))))

    lines = [str(q)]
    for _ in range(q):
        a, b = pick_range(rng, hi)
        lines.append(f"{a} {b}")
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
