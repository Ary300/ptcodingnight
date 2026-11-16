"""Largest Permutation -- input generator.

Usage: python3 generator.py <seed> [n] [shape] [k | short]

Deterministic per argument list. With only a seed, n grows as seed squared
(capped at the constraint ceiling) and the shape cycles with the seed, so a
straight run of seeds already covers tiny arrays, the ceiling, and every
shape. The optional arguments pin n, the shape, and k exactly, which is how
the shipped test set names its adversarial cases explicitly. Passing the word
`short` for k sets it to one less than the number of swaps the greedy needs to
reach n..1, so the budget runs out on the very last defect.

Two answers need no thought at all: n..1 (ignore k) and the input itself (ignore
everything). Only the hand-picked edge cases 03 (a sample), 04 (n = 1), 07 (k = 0)
and 08 (already descending) expect one of them. Every other shape below keeps k
short of the swaps needed, so neither shortcut passes it.

Generated tests, by command line:
  05 = 5 6 random short        06 = 6 9 tinyk
  09 = 9 10 ascending          11 = 11 40 neardesc short
  15 = 15 99999 random         16 = 16 100000 neardesc short
  17 = 17 100000 ascending short  19 = 19 100000 random

Shapes:
  random     uniform random permutation, k drawn across the whole legal range
  ascending  1..n in order: every prefix position needs a swap, the greedy's
             worst case for work done
  descending n..1 in order: already lexicographically largest, zero swaps
             should be spent no matter how large k is (edge case only, its
             answer is the trivial one)
  neardesc   descending except a handful of random transpositions, so only a
             few deep defects need fixing
  zerok      random permutation with k = 0: the output must echo the input
             (edge case only, its answer is the trivial one)
  tinyk      random permutation with k in 1..3: the budget runs out early
"""

import random
import sys

MAX_N = 100000
MAX_K = 10**9

SHAPES = ("random", "ascending", "descending", "neardesc", "zerok", "tinyk")


def choose_n(seed: int) -> int:
    return max(1, min(MAX_N, seed * seed))


def swaps_needed(a: list[int]) -> int:
    """How many swaps the greedy spends turning a into n..1 when k is unlimited."""
    n = len(a)
    b = a[:]
    where = [0] * (n + 1)
    for i, v in enumerate(b):
        where[v] = i
    swaps = 0
    for i in range(n):
        want = n - i
        if b[i] != want:
            j = where[want]
            where[b[i]], where[want] = j, i
            b[i], b[j] = b[j], b[i]
            swaps += 1
    return swaps


def choose_k(shape: str, n: int, rng: random.Random, needed: int) -> int:
    if shape == "zerok":
        return 0
    if shape == "tinyk":
        return rng.randint(1, 3)
    if shape == "descending":
        return rng.choice([1, n, MAX_K])
    # ascending / random / neardesc: some budget, always short of what the greedy
    # needs to finish, so printing n..1 is wrong.
    if needed <= 1:
        return 0
    return rng.choice([needed - 1, rng.randint(1, needed - 1), rng.randint(1, max(1, needed // 10))])


def build(shape: str, n: int, rng: random.Random) -> list[int]:
    a = list(range(1, n + 1))
    if shape == "ascending":
        return a
    if shape == "descending":
        return a[::-1]
    if shape == "neardesc":
        a = a[::-1]
        for _ in range(min(n, rng.randint(1, 4))):
            i, j = rng.randrange(n), rng.randrange(n)
            a[i], a[j] = a[j], a[i]
        return a
    # random / zerok / tinyk
    rng.shuffle(a)
    return a


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = int(sys.argv[2]) if len(sys.argv) > 2 else choose_n(seed)
    shape = sys.argv[3] if len(sys.argv) > 3 else SHAPES[seed % len(SHAPES)]
    if shape not in SHAPES:
        raise SystemExit(f"unknown shape: {shape}")
    a = build(shape, n, rng)
    needed = swaps_needed(a)
    if len(sys.argv) > 4 and sys.argv[4] == "short":
        k = max(0, needed - 1)
    elif len(sys.argv) > 4:
        k = int(sys.argv[4])
    else:
        k = choose_k(shape, n, rng, needed)

    assert 1 <= n <= MAX_N
    assert 0 <= k <= MAX_K
    assert sorted(a) == list(range(1, n + 1))

    out = sys.stdout
    out.write(f"{n} {k}\n")
    out.write(" ".join(str(v) for v in a))
    out.write("\n")


if __name__ == "__main__":
    main()
