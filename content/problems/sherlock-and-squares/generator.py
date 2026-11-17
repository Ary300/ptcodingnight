"""Deterministic input generator.

Usage: python3 generator.py <seed> > tests/NN.in
       python3 generator.py tiled > tests/08.in

Small seeds produce small inputs; large seeds push q and the values toward the
constraint ceiling (q = 100, b = 10^6). The total length of all ranges in one
input, the sum of b - a + 1, stays at most 10^6, so a solution that checks
every number in every range one at a time still finishes comfortably.

Where each test comes from:

  01  sample: 2 ranges, "3 9" and "17 24" (hand-written)
  02  sample: the single range "1 1000000" (hand-written)
  03  "1 1", the smallest possible input (hand-written)
  04  "1 999999", the whole value range except its largest square (hand-written)
  05  q = 100, every range "10000 10000", all equal and each a square (hand-written)
  06  9 ranges that each sit strictly between two consecutive squares,
      including the last gaps below 10^6 (hand-written)
  07  12 single-value ranges, squares and their neighbours, up to 10^6
      (hand-written)
  08  `tiled`: q = 100 ranges [10000 i + 1, 10000 (i + 1)] that tile
      [1, 10^6] exactly, so the range lengths add up to the 10^6 ceiling
  09  seed 3
  10  seed 17
  11  seed 125
  12  seed 900
  13  seed 2400
  14  seed 4800
  15  seed 12345
"""

import math
import random
import sys

MAX_Q = 100
MAX_V = 10 ** 6
MAX_TOTAL_SPAN = 10 ** 6
SCALE_SEED = 5000.0
TILE = 10 ** 4


def size_fraction(seed: int) -> float:
    """0.0 for tiny seeds, 1.0 once the seed reaches SCALE_SEED."""
    return min(1.0, max(0.0, seed / SCALE_SEED))


def pick_range(rng: random.Random, hi: int, span_cap: int) -> tuple[int, int]:
    """Pick 1 <= a <= b <= hi with b - a < span_cap, often hugging a perfect-square boundary."""
    style = rng.randint(0, 3)
    root_max = math.isqrt(hi)
    if style == 0 and root_max >= 2:
        # A range that starts or ends right next to a perfect square.
        k = rng.randint(1, root_max)
        square = k * k
        a = min(hi, max(1, square + rng.randint(-1, 1)))
        b = min(hi, a + span_cap - 1, a + rng.randint(0, max(1, hi // 100)))
    elif style == 1:
        # A very short range (often a single value).
        a = rng.randint(1, hi)
        b = min(hi, a + rng.randint(0, 2))
    else:
        # A plain random range, no longer than span_cap.
        a = rng.randint(1, hi)
        b = rng.randint(a, min(hi, a + span_cap - 1))
    return a, b


def tiled() -> list[str]:
    """q = MAX_Q ranges of TILE values each that cover [1, MAX_V] with no gap or overlap."""
    return [str(MAX_Q)] + [f"{i * TILE + 1} {(i + 1) * TILE}" for i in range(MAX_Q)]


def seeded(seed: int) -> list[str]:
    rng = random.Random(seed)
    frac = size_fraction(seed)
    q_cap = max(1, round(1 + (MAX_Q - 1) * frac))
    q = rng.randint(1, q_cap)
    hi = max(1, min(MAX_V, int(10 ** (1 + 8 * frac))))
    span_cap = MAX_TOTAL_SPAN // q

    lines = [str(q)]
    for _ in range(q):
        a, b = pick_range(rng, hi, span_cap)
        lines.append(f"{a} {b}")
    return lines


def main() -> None:
    arg = sys.argv[1]
    lines = tiled() if arg == "tiled" else seeded(int(arg))
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
