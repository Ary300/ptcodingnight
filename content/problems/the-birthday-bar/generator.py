"""Subarray Division -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short bars; large seeds push n to
the constraint ceiling. The seed also selects the shape of the bar so the test
set covers degenerate cases (single square, all squares equal, sums that sit
one off the target everywhere, targets that every window hits) and not just
uniform noise.
"""

import random
import sys

MAX_N = 100000
MAX_DIGIT = 9
MAX_D = 31
MAX_M = 12


def choose_n(seed: int, rng: random.Random) -> int:
    """Grow with the seed: seed 1 -> a few squares, seed >= 317 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed + rng.randint(0, seed)))


def build_input(seed: int, n: int, rng: random.Random) -> tuple[list[int], int, int]:
    m = rng.randint(1, min(MAX_M, n))
    shape = seed % 5

    if shape == 0:
        # Uniform noise, target drawn independently.
        squares = [rng.randint(1, MAX_DIGIT) for _ in range(n)]
        return squares, rng.randint(1, MAX_D), m

    if shape == 1:
        # All squares identical: every window matches, or none does.
        v = rng.randint(1, MAX_DIGIT)
        exact = v * m
        d = exact if exact <= MAX_D and rng.random() < 0.5 else rng.randint(1, MAX_D)
        return [v] * n, d, m

    if shape == 2:
        # Target taken from a real window, so at least one run matches.
        squares = [rng.randint(1, MAX_DIGIT) for _ in range(n)]
        start = rng.randint(0, n - m)
        d = sum(squares[start:start + m])
        if d > MAX_D:
            # Rebuild that window from low digits so its sum fits the bound.
            for i in range(start, start + m):
                squares[i] = rng.randint(1, max(1, MAX_D // m))
            d = sum(squares[start:start + m])
        return squares, d, m

    if shape == 3:
        # Low digits only, target near the window sum: heavy near-miss traffic.
        squares = [rng.randint(1, 3) for _ in range(n)]
        d = min(MAX_D, max(1, 2 * m + rng.randint(-1, 1)))
        return squares, d, m

    # shape == 4: ascending/descending sawtooth over the digit range. Prefer a
    # target read off a real window (when one fits the d bound) so the answer
    # is not trivially zero on this highly structured bar.
    up = seed % 2 == 0
    squares = [
        (i % MAX_DIGIT) + 1 if up else MAX_DIGIT - (i % MAX_DIGIT)
        for i in range(n)
    ]
    for _ in range(20):
        start = rng.randint(0, n - m)
        window = sum(squares[start:start + m])
        if window <= MAX_D:
            return squares, window, m
    return squares, rng.randint(1, MAX_D), m


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed, rng)
    squares, d, m = build_input(seed, n, rng)
    assert len(squares) == n
    assert all(1 <= s <= MAX_DIGIT for s in squares)
    assert 1 <= d <= MAX_D
    assert 1 <= m <= min(MAX_M, n)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(s) for s in squares))
    out.write("\n")
    out.write(f"{d} {m}\n")


if __name__ == "__main__":
    main()
