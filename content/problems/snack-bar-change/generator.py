"""Snack Bar Change -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds give one short game; larger seeds give up to five games
at the 10^5 ceiling. Each game is drawn from one of several shapes so the test set covers
lines that fail at the very front, lines that never fail, lines where only the greedy order
of change survives (lots of 5s arriving after a mix of 1s and 2s), big floats that make a
run of 5s serviceable, and lines made of a single kind of bill.
"""

import random
import sys

MAX_T = 5
MAX_N = 100_000
MAX_FLOAT = 100_000


def choose_t_and_n(seed, rng):
    if seed <= 4:
        return 1, rng.randint(1, 10)
    if seed <= 8:
        return rng.randint(1, 3), rng.randint(20, 500)
    if seed <= 11:
        return rng.randint(2, MAX_T), rng.randint(5_000, 40_000)
    return MAX_T, MAX_N


def build_game(shape, n, rng):
    if shape == 0:
        # Empty drawer; the first student pays with a 5 or a 2 and the line stops at once.
        bills = [rng.choice([2, 5])] + [rng.choice([1, 2, 5]) for _ in range(n - 1)]
        return 0, 0, bills
    if shape == 1:
        # A line of 1s only: nothing to hand back, always ok.
        return rng.randint(0, 3), rng.randint(0, 3), [1] * n
    if shape == 2:
        # Uniform mix from an empty drawer. Usually fails somewhere in the middle.
        return 0, 0, [rng.choice([1, 2, 5]) for _ in range(n)]
    if shape == 3:
        # Weighted toward 1s so the line tends to survive, then a burst of 5s at the end.
        tail = min(n, rng.randint(1, max(1, n // 10)))
        head = [rng.choice([1, 1, 1, 2]) for _ in range(n - tail)]
        return rng.randint(0, 5), rng.randint(0, 5), head + [5] * tail
    if shape == 4:
        # Huge float: even a line of all 5s can be served for a while.
        ones = rng.randint(0, MAX_FLOAT)
        twos = rng.randint(0, MAX_FLOAT)
        return ones, twos, [rng.choice([5, 5, 5, 2]) for _ in range(n)]
    # Two-dollar bills only, with a float of 1s that runs out part way.
    return rng.randint(0, n), 0, [2] * n


def main():
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    t, ceiling = choose_t_and_n(seed, rng)
    lines = [str(t)]
    for game in range(t):
        n = ceiling if seed >= 12 else rng.randint(1, ceiling)
        shape = (seed + game) % 6
        ones, twos, bills = build_game(shape, n, rng)
        assert len(bills) == n
        assert all(b in (1, 2, 5) for b in bills)
        assert 0 <= ones <= MAX_FLOAT and 0 <= twos <= MAX_FLOAT
        lines.append(f"{n} {ones} {twos}")
        lines.append(" ".join(map(str, bills)))
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
