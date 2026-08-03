"""Largest Permutation -- input generator.

Usage: python3 generator.py <seed> [n] [shape] [k]

Deterministic per argument list. With only a seed, n grows as seed squared
(capped at the constraint ceiling) and the shape cycles with the seed, so a
straight run of seeds already covers tiny arrays, the ceiling, and every
shape. The optional arguments pin n, the shape, and k exactly, which is how
the shipped test set names its adversarial cases explicitly.

Shapes:
  random     uniform random permutation, k drawn across the whole legal range
  ascending  1..n in order: every prefix position needs a swap, the greedy's
             worst case for work done
  descending n..1 in order: already lexicographically largest, zero swaps
             should be spent no matter how large k is
  neardesc   descending except a handful of random transpositions, so only a
             few deep defects need fixing
  zerok      random permutation with k = 0: the output must echo the input
  tinyk      random permutation with k in 1..3: the budget runs out early
"""

import random
import sys

MAX_N = 100000
MAX_K = 10**9

SHAPES = ("random", "ascending", "descending", "neardesc", "zerok", "tinyk")


def choose_n(seed: int) -> int:
    return max(1, min(MAX_N, seed * seed))


def choose_k(shape: str, n: int, rng: random.Random) -> int:
    if shape == "zerok":
        return 0
    if shape == "tinyk":
        return rng.randint(1, 3)
    if shape == "ascending":
        return rng.choice([n // 2, n, MAX_K])
    if shape == "descending":
        return rng.choice([1, n, MAX_K])
    # random / neardesc: anywhere in the legal range, biased toward small.
    return rng.choice([0, 1, rng.randint(0, max(1, n)), rng.randint(0, MAX_K)])


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
    k = int(sys.argv[4]) if len(sys.argv) > 4 else choose_k(shape, n, rng)

    assert 1 <= n <= MAX_N
    assert 0 <= k <= MAX_K
    assert sorted(a) == list(range(1, n + 1))

    out = sys.stdout
    out.write(f"{n} {k}\n")
    out.write(" ".join(str(v) for v in a))
    out.write("\n")


if __name__ == "__main__":
    main()
