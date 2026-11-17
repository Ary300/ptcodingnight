"""Breaking the Records -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short seasons; large seeds push n
to the constraint ceiling. The seed also selects the shape of the score list
so the test set covers degenerate cases (single game, all totals equal,
strictly increasing, strictly decreasing, heavy ties, random walks, and the
value bounds 0 and 10^6) rather than only uniform noise.

Which test came from where:
  01, 02   the two statement examples, written by hand
  03-08    hand-written edge cases: one game scoring 0, one game scoring
           10^6, two tied games, a high break, a low break, sixty ties
  09 seed 26 (strictly increasing)   10 seed 27 (strictly decreasing)
  11 seed 15 (extremes only)         12 seed 20 (tiny value range)
  13 seed 21 (zigzag)                14 seed 30 (random walk)
  15 seed 16 (uniform noise)         16 seed 40 (uniform noise, n = 1000)
  17 seed 72 (uniform noise, n = 1000)
  18 seed 74 (strictly increasing, n = 1000)

The bounds are kept small (n <= 1000, scores <= 10^6) so every value and
every count fits comfortably in a 32-bit int and a straightforward solution
is never pressed by the time limit.
"""

import random
import sys

MAX_N = 1000
MAX_SCORE = 10**6


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 game, seed >= 32 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def build_scores(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 8

    if shape == 0:
        # Uniform noise over the full value range, including the bounds.
        return [rng.randint(0, MAX_SCORE) for _ in range(n)]

    if shape == 1:
        # Every game scores the same total: zero breaks after game one.
        value = rng.randint(0, MAX_SCORE)
        return [value] * n

    if shape == 2:
        # Strictly increasing: every game after the first breaks the high.
        start = rng.randint(0, MAX_SCORE - n)
        steps = sorted(rng.sample(range(start, min(MAX_SCORE, start + 4 * n) + 1), n))
        return steps

    if shape == 3:
        # Strictly decreasing: every game after the first breaks the low.
        start = rng.randint(n, MAX_SCORE)
        steps = sorted(rng.sample(range(max(0, start - 4 * n), start + 1), n))
        return steps[::-1]

    if shape == 4:
        # Tiny value range: ties everywhere, records barely move.
        base = rng.randint(0, MAX_SCORE - 3)
        return [base + rng.randint(0, 3) for _ in range(n)]

    if shape == 5:
        # Zigzag around a midpoint with growing amplitude: both records
        # break in alternation.
        mid = MAX_SCORE // 2
        out = [mid]
        for i in range(1, n):
            spread = min(mid, i * (MAX_SCORE // (2 * max(1, n))) + rng.randint(0, 5))
            out.append(mid + spread if i % 2 == 0 else mid - spread)
        return out

    if shape == 6:
        # Bounded random walk: records break early then rarely.
        value = rng.randint(0, MAX_SCORE)
        out = []
        for _ in range(n):
            out.append(value)
            value = min(MAX_SCORE, max(0, value + rng.randint(-1000, 1000)))
        return out

    # shape == 7: extremes only, hammering the 0 and 10^6 bounds.
    return [rng.choice((0, MAX_SCORE, MAX_SCORE // 2)) for _ in range(n)]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    scores = build_scores(seed, n, rng)
    assert len(scores) == n
    assert all(0 <= s <= MAX_SCORE for s in scores)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(s) for s in scores))
    out.write("\n")


if __name__ == "__main__":
    main()
