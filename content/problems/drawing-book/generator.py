"""Deterministic input generator for "Drawing Book".

Usage:  python3 generator.py <seed>  > tests/NN.in

Sizing tiers (small seeds -> tiny inputs, large seeds -> constraint ceiling):

    seed <  10        n = seed, q = n                         (degenerate/tiny)
    seed <  1000      n up to 1000, q up to 50                (small)
    seed <  100000    n up to 10^7, q up to 10^4              (medium)
    seed >= 100000    n within 10 of 10^9, q = 10^5           (ceiling)

Every input always includes the interesting boundary pages: 1, n, and the two
pages either side of the middle spread, so degenerate shapes are exercised even
inside the random tiers.
"""

import random
import sys

MAX_PAGES = 10 ** 9
MAX_QUERIES = 10 ** 5


def choose_size(rng: random.Random, seed: int) -> "tuple[int, int]":
    if seed < 10:
        pages = max(1, seed)
        return pages, pages
    if seed < 1000:
        pages = rng.randint(1, 1000)
        return pages, rng.randint(1, 50)
    if seed < 100000:
        pages = rng.randint(10 ** 4, 10 ** 7)
        return pages, rng.randint(100, 10 ** 4)
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
