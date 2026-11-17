"""Deterministic input generator for "Drawing Book".

Usage:  python3 generator.py <seed>  > tests/NN.in

Sizing tiers (small seeds -> tiny inputs, large seeds -> constraint ceiling):

    seed <  10        n = seed, q = n                         (degenerate/tiny)
    seed <  1000      n up to 200, q up to 50                 (small)
    seed <  100000    n from 200 to 1000, q from 100 to 1000  (medium)
    seed >= 100000    n within 10 of 1000, q = 1000           (ceiling)

The ceiling is sized for a casual contest: every value fits comfortably in a
32-bit int, and a student who simulates the flips one at a time for every
query still finishes well inside the time limit.

Every input always includes the interesting boundary pages: 1, n, and the two
pages either side of the middle spread, so degenerate shapes are exercised even
inside the random tiers.

Tests 01 and 02 are the hand-written samples from the statement. The rest:

    03 seed 1        04 seed 2        05 seed 4        06 seed 9
    07 seed 137      08 seed 512      09 seed 999
    10 seed 4321     11 seed 60000    12 seed 99999
    13 seed 100000   14 seed 1000002   (n = 999 odd, n = 1000 even)
"""

import random
import sys

MAX_PAGES = 1000
MAX_QUERIES = 1000
SMALL_PAGES = 200


def choose_size(rng: random.Random, seed: int) -> "tuple[int, int]":
    if seed < 10:
        pages = max(1, seed)
        return pages, pages
    if seed < 1000:
        pages = rng.randint(1, SMALL_PAGES)
        return pages, rng.randint(1, 50)
    if seed < 100000:
        pages = rng.randint(SMALL_PAGES, MAX_PAGES)
        return pages, rng.randint(100, MAX_QUERIES)
    pages = MAX_PAGES - rng.randint(0, 10)
    return pages, MAX_QUERIES


def build_queries(rng: random.Random, pages: int, query_count: int) -> "list[int]":
    forced = [1, pages, pages // 2, pages // 2 + 1, (pages // 2) * 2]
    forced = [p for p in forced if 1 <= p <= pages]

    queries = forced[:query_count]
    while len(queries) < query_count:
        queries.append(rng.randint(1, pages))
    rng.shuffle(queries)
    return queries


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)

    pages, query_count = choose_size(rng, seed)
    query_count = max(1, min(query_count, MAX_QUERIES))
    queries = build_queries(rng, pages, query_count)

    out = [str(pages), str(len(queries))]
    out.extend(str(p) for p in queries)
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
