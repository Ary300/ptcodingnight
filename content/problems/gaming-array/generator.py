"""Gaming Array -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed picks both a size band and a shape family so
the test set covers the degenerate rows (single tile, sorted, reverse sorted,
maximum first, maximum last), rows engineered for a specific number of prefix
maxima, many tiny games at the game-count ceiling, and full-size random rows,
not just uniform noise. Values within a game are always distinct.
"""

import random
import sys

MAX_G = 100
MAX_N = 100000
MAX_TOTAL = 200000
MAX_VALUE = 10**9


def distinct_values(rng: random.Random, n: int) -> list[int]:
    """n distinct values in [1, MAX_VALUE], in random order."""
    return rng.sample(range(1, MAX_VALUE + 1), n)


def shaped_row(rng: random.Random, n: int, shape: int) -> list[int]:
    vals = distinct_values(rng, n)
    if shape == 0:
        return vals  # uniform random order
    if shape == 1:
        return sorted(vals)  # strictly increasing: n prefix maxima
    if shape == 2:
        return sorted(vals, reverse=True)  # strictly decreasing: 1 move
    if shape == 3:
        # Maximum first: one move regardless of the rest.
        vals.sort()
        top = vals.pop()
        rng.shuffle(vals)
        return [top] + vals
    if shape == 4:
        # Maximum last: forces at least two prefix maxima when n > 1.
        vals.sort()
        top = vals.pop()
        rng.shuffle(vals)
        return vals + [top]
    # shape == 5: exactly k prefix maxima. Place k ascending "peaks" and fill
    # the gaps after each peak with smaller values in random order.
    vals.sort()
    k = rng.randint(1, n)
    peaks = vals[-k:]
    rest = vals[:-k]
    rng.shuffle(rest)
    gaps = [[] for _ in range(k)]
    for v in rest:
        gaps[rng.randrange(k)].append(v)
    row: list[int] = []
    for peak, gap in zip(peaks, gaps):
        row.append(peak)
        row.extend(gap)
    return row


def build_games(seed: int, rng: random.Random) -> list[list[int]]:
    band = seed % 4
    if band == 0:
        # Many tiny games, up to the game-count ceiling.
        g = rng.randint(MAX_G // 2, MAX_G)
        return [shaped_row(rng, rng.randint(1, 40), rng.randrange(6))
                for _ in range(g)]
    if band == 1:
        # A handful of small-to-medium games.
        g = rng.randint(1, 10)
        return [shaped_row(rng, rng.randint(1, 2000), rng.randrange(6))
                for _ in range(g)]
    if band == 2:
        # One full-size game.
        return [shaped_row(rng, MAX_N, rng.randrange(6))]
    # band == 3: fill the total-tile budget with large games. The first game is
    # always the full-size strictly increasing row, which forces the maximum
    # possible number of moves and punishes per-move simulation.
    games: list[list[int]] = [shaped_row(rng, MAX_N, 1)]
    remaining = MAX_TOTAL - MAX_N
    while remaining > 0 and len(games) < MAX_G:
        n = min(remaining, rng.randint(MAX_N // 4, MAX_N))
        games.append(shaped_row(rng, n, rng.randrange(6)))
        remaining -= n
    return games


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    games = build_games(seed, rng)

    assert 1 <= len(games) <= MAX_G
    assert sum(len(row) for row in games) <= MAX_TOTAL
    for row in games:
        assert 1 <= len(row) <= MAX_N
        assert len(set(row)) == len(row)
        assert all(1 <= v <= MAX_VALUE for v in row)

    out = sys.stdout
    out.write(f"{len(games)}\n")
    for row in games:
        out.write(f"{len(row)}\n")
        out.write(" ".join(str(v) for v in row))
        out.write("\n")


if __name__ == "__main__":
    main()
