"""Lonely Integer -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce tiny lists; seeds >= 32 push n to
the constraint ceiling of 999 (n is always odd). The seed also selects a
layout so the test set covers adversarial shapes (lonely value first or last,
sorted and reverse-sorted input, matched pairs adjacent, pairs split across
the halves, values clustered at the constraint extremes) and not just uniform
noise.

The ceiling is kept moderate on purpose (n <= 999, values <= 10^6) for a
casual contest: every value fits a 32-bit int, and a student who counts each
value with a nested loop still finishes well inside the time limit.

Which seed made which test:

    tests/13  seed 10   n = 99   shape 2 (lonely value last)
    tests/14  seed 23   n = 529  shape 7 (values hug 0 and 10^6)
    tests/15  seed 100  n = 999  shape 4 (sorted descending)
    tests/16  seed 203  n = 999  shape 3 (sorted ascending)
    tests/17  seed 317  n = 999  shape 5 (matched pairs adjacent)
    tests/18  seed 448  n = 999  shape 0 (fully shuffled)

Tests 01-12 are written by hand (01 and 02 are the statement samples). Tests
04, 09, 10 and 12 were rescaled into the 10^6 value range when the bounds
shrank: every value v became v // 1000 (still distinct, so each test keeps its
layout) and the old 10^9 maximum became 10^6.
"""

import random
import sys

MAX_N = 1000
MAX_VALUE = 10**6


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 entry, seed >= 32 -> the odd ceiling 999."""
    n = max(1, min(MAX_N - 1, seed * seed))
    return n if n % 2 == 1 else n - 1


def pick_values(rng: random.Random, count: int, shape: int) -> list[int]:
    """Return `count` distinct values, clustered at the extremes for shape 7."""
    if shape == 7:
        # Values hug 0 and MAX_VALUE; pools sized so sampling never runs dry.
        half = count // 2
        rest = count - half
        low = rng.sample(range(0, max(1, half) * 4 + 4), half) if half else []
        high = rng.sample(
            range(MAX_VALUE - max(1, rest) * 4 - 4, MAX_VALUE + 1), rest
        )
        return low + high
    return rng.sample(range(0, MAX_VALUE + 1), count)


def build_list(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 8
    pair_count = (n - 1) // 2
    values = pick_values(rng, pair_count + 1, shape)
    lonely = values[0]
    pairs = values[1:]

    if shape == 1:
        # Lonely value first, pairs shuffled behind it.
        tail = pairs * 2
        rng.shuffle(tail)
        return [lonely] + tail

    if shape == 2:
        # Lonely value last.
        head = pairs * 2
        rng.shuffle(head)
        return head + [lonely]

    if shape == 3:
        # Sorted ascending.
        return sorted(pairs * 2 + [lonely])

    if shape == 4:
        # Sorted descending.
        return sorted(pairs * 2 + [lonely], reverse=True)

    if shape == 5:
        # Each matched pair sits adjacent; the lonely value lands mid-list.
        out: list[int] = []
        for value in pairs:
            out.extend((value, value))
        out.insert(len(out) // 2, lonely)
        return out

    if shape == 6:
        # First copy of every pair in the first half, second copies mirrored
        # in the second half, lonely value in the exact middle.
        return pairs + [lonely] + list(reversed(pairs))

    # shapes 0 and 7: fully shuffled.
    out = pairs * 2 + [lonely]
    rng.shuffle(out)
    return out


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    entries = build_list(seed, n, rng)

    assert len(entries) == n
    assert n % 2 == 1
    assert all(0 <= v <= MAX_VALUE for v in entries)
    counts: dict[int, int] = {}
    for v in entries:
        counts[v] = counts.get(v, 0) + 1
    assert sorted(counts.values()) == [1] + [2] * ((n - 1) // 2)

    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(v) for v in entries))
    out.write("\n")


if __name__ == "__main__":
    main()
