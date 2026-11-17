"""Random input generator for "Sales by Match".

Usage: python3 generator.py <seed>
       python3 generator.py all-same | all-distinct | all-paired | two-codes-odd

Deterministic per seed. Small seeds produce small bins; large seeds push n and the
colour-code range toward the constraint ceiling.

Sizes are kept moderate for a casual contest: at most 1,000 gloves and colour codes
up to 10^6, so the answer is at most 500 and every value fits a 32-bit int.

Where each test came from:
  01-02  hand-written samples (shown in the statement)
  03     hand-written: a single glove, no pair
  04     hand-written: two gloves at the largest colour code
  05     all-same: 1,000 gloves all stamped 1000000 -> 500 pairs
  06     all-distinct: 1,000 distinct codes, shuffled -> 0 pairs
  07     all-paired: 500 distinct codes each appearing exactly twice, shuffled
  08     two-codes-odd: 999 gloves using only codes 1 and 2
  09     seed 3      10  seed 7      11  seed 42
  12     seed 101    13  seed 512    14  seed 1234
"""

import random
import sys

MAX_N = 1000
MAX_CODE = 1000000


def choose_n(seed: int, rng: random.Random) -> int:
    """Small seeds -> tiny bins, large seeds -> bins at the constraint ceiling."""
    if seed < 10:
        return rng.randint(1, 10)
    if seed < 100:
        return rng.randint(10, 100)
    if seed < 1000:
        return rng.randint(100, 500)
    return rng.randint(MAX_N // 2, MAX_N)


def choose_alphabet(seed: int, rng: random.Random) -> int:
    """Width of the colour-code pool: narrow means lots of pairs, wide means few."""
    if seed % 4 == 0:
        return 1
    if seed % 4 == 1:
        return rng.randint(2, 5)
    if seed % 4 == 2:
        return rng.randint(6, 200)
    return MAX_CODE


def seeded_case(seed: int) -> list[int]:
    rng = random.Random(seed)
    n = choose_n(seed, rng)
    alphabet = choose_alphabet(seed, rng)
    if alphabet < MAX_CODE:
        pool = rng.sample(range(1, MAX_CODE + 1), alphabet)
        return [rng.choice(pool) for _ in range(n)]
    return [rng.randint(1, MAX_CODE) for _ in range(n)]


def named_case(name: str) -> list[int]:
    """The four hand-designed full-size cases, 05 to 08."""
    rng = random.Random(name)
    if name == "all-same":
        return [MAX_CODE] * MAX_N
    if name == "all-distinct":
        return rng.sample(range(1, MAX_CODE + 1), MAX_N)
    if name == "all-paired":
        codes = rng.sample(range(1, MAX_CODE + 1), MAX_N // 2) * 2
        rng.shuffle(codes)
        return codes
    if name == "two-codes-odd":
        return [rng.randint(1, 2) for _ in range(MAX_N - 1)]
    raise SystemExit(f"unknown case {name!r}")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: generator.py <seed> | <case name>")

    arg = sys.argv[1]
    codes = seeded_case(int(arg)) if arg.isdigit() else named_case(arg)
    assert 1 <= len(codes) <= MAX_N
    assert all(1 <= code <= MAX_CODE for code in codes)

    out = sys.stdout
    out.write(str(len(codes)))
    out.write("\n")
    out.write(" ".join(str(code) for code in codes))
    out.write("\n")


if __name__ == "__main__":
    main()
