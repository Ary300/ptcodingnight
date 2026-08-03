"""Weighted Uniform Strings -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short strings and few queries;
large seeds push both toward the constraint ceilings. The seed selects the
shape of the string (uniform noise, a single letter, a few long runs, strict
alternation, sorted runs) and the queries mix guaranteed hits, near misses
(an achievable weight plus or minus one), overshoots (a valid multiple of a
letter weight that needs a longer run than exists), and the extremes 1 and
10^7.
"""

import random
import sys
from itertools import groupby

MAX_N = 100000
MAX_Q = 100000
MAX_X = 10**7


def choose_size(seed: int) -> tuple[int, int]:
    n = max(1, min(MAX_N, seed * seed))
    q = max(1, min(MAX_Q, seed * seed))
    return n, q


def build_string(seed: int, n: int, rng: random.Random) -> str:
    shape = seed % 5

    if shape == 0:
        # Uniform noise over the whole alphabet.
        return "".join(rng.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(n))

    if shape == 1:
        # One letter repeated: the longest possible run.
        return rng.choice("abcdefghijklmnopqrstuvwxyz") * n

    if shape == 2:
        # A few letters in long random runs.
        letters = rng.sample("abcdefghijklmnopqrstuvwxyz", min(4, n))
        pieces: list[str] = []
        remaining = n
        while remaining > 0:
            run = min(remaining, rng.randint(1, max(1, n // 3)))
            pieces.append(rng.choice(letters) * run)
            remaining -= run
        return "".join(pieces)

    if shape == 3:
        # Strict alternation: every run has length 1.
        a, b = rng.sample("abcdefghijklmnopqrstuvwxyz", 2)
        return "".join(a if i % 2 == 0 else b for i in range(n))

    # shape == 4: sorted runs, a block per letter in alphabetical order.
    pieces = []
    remaining = n
    for i, ch in enumerate("abcdefghijklmnopqrstuvwxyz"):
        if remaining <= 0:
            break
        run = remaining if i == 25 else rng.randint(1, max(1, remaining // 2))
        pieces.append(ch * min(run, remaining))
        remaining -= run
    return "".join(pieces)[:n]


def build_queries(s: str, q: int, rng: random.Random) -> list[int]:
    achievable: list[int] = []
    max_run: dict[str, int] = {}
    for ch, group in groupby(s):
        length = sum(1 for _ in group)
        weight = ord(ch) - 96
        max_run[ch] = max(max_run.get(ch, 0), length)
        achievable.extend(weight * k for k in range(1, length + 1))

    queries: list[int] = []
    for _ in range(q):
        roll = rng.random()
        if roll < 0.4:
            # Guaranteed hit.
            queries.append(rng.choice(achievable))
        elif roll < 0.6:
            # Near miss: an achievable weight nudged by one.
            queries.append(max(1, rng.choice(achievable) + rng.choice((-1, 1))))
        elif roll < 0.8:
            # Overshoot: right letter, run longer than the string has.
            ch = rng.choice(list(max_run))
            weight = ord(ch) - 96
            queries.append(min(MAX_X, weight * (max_run[ch] + rng.randint(1, 5))))
        elif roll < 0.9:
            # Uniform noise across the whole query range.
            queries.append(rng.randint(1, MAX_X))
        else:
            # Constraint extremes.
            queries.append(rng.choice((1, MAX_X)))
    return queries


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n, q = choose_size(seed)
    s = build_string(seed, n, rng)
    assert len(s) == n
    assert s.islower() and s.isalpha()
    queries = build_queries(s, q, rng)
    assert len(queries) == q
    assert all(1 <= x <= MAX_X for x in queries)

    out = sys.stdout
    out.write(s + "\n")
    out.write(f"{q}\n")
    out.write("\n".join(str(x) for x in queries))
    out.write("\n")


if __name__ == "__main__":
    main()
