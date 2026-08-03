"""Equalize the Array -- seeded random input generator.

Usage: python3 generator.py <mode> <seed> [args...]

Modes:
  random <seed> <n> <lo> <hi>      n values uniform in [lo, hi]
  allequal <seed> <n>              n copies of one random value in [1, 100]
  distinct <seed> <n>              n distinct values (n <= 100), shuffled
  sorted <seed> <n> <lo> <hi>      uniform values, sorted ascending
  reversed <seed> <n> <lo> <hi>    uniform values, sorted descending
  bounds <seed> <n>                values drawn only from {1, 100}
  tie <seed> <n> <k>               two values each appearing k times, rest random
  outlier <seed> <n>               one value n-1 times plus a single different value
"""

import random
import sys

MAX_VALUE = 100


def emit(values: list[int]) -> None:
    print(len(values))
    print(" ".join(str(v) for v in values))


def main() -> None:
    mode = sys.argv[1]
    rng = random.Random(int(sys.argv[2]))

    if mode == "random":
        n, lo, hi = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
        emit([rng.randint(lo, hi) for _ in range(n)])
    elif mode == "allequal":
        n = int(sys.argv[3])
        v = rng.randint(1, MAX_VALUE)
        emit([v] * n)
    elif mode == "distinct":
        n = int(sys.argv[3])
        assert n <= MAX_VALUE
        values = rng.sample(range(1, MAX_VALUE + 1), n)
        emit(values)
    elif mode == "sorted":
        n, lo, hi = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
        emit(sorted(rng.randint(lo, hi) for _ in range(n)))
    elif mode == "reversed":
        n, lo, hi = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
        emit(sorted((rng.randint(lo, hi) for _ in range(n)), reverse=True))
    elif mode == "bounds":
        n = int(sys.argv[3])
        emit([rng.choice((1, MAX_VALUE)) for _ in range(n)])
    elif mode == "tie":
        n, k = int(sys.argv[3]), int(sys.argv[4])
        a, b = rng.sample(range(1, MAX_VALUE + 1), 2)
        rest = n - 2 * k
        assert rest >= 0
        others = [v for v in range(1, MAX_VALUE + 1) if v not in (a, b)]
        values = [a] * k + [b] * k
        # Filler values appear strictly fewer than k times each.
        while len(values) < n:
            v = rng.choice(others)
            room = min(k - 1, n - len(values))
            take = rng.randint(1, room) if room > 1 else 1
            values.extend([v] * take)
        rng.shuffle(values)
        emit(values)
    elif mode == "outlier":
        n = int(sys.argv[3])
        a, b = rng.sample(range(1, MAX_VALUE + 1), 2)
        values = [a] * (n - 1) + [b]
        rng.shuffle(values)
        emit(values)
    else:
        raise SystemExit(f"unknown mode: {mode}")


if __name__ == "__main__":
    main()
