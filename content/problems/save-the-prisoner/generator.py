"""Random input generator for "Save the Prisoner!".

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce small inputs; large seeds push the
input toward the constraint ceiling. Seeds divisible by 5 produce edge-case-only
inputs (minimum bounds, maximum bounds, exact wraps, all-equal rows).
"""

import random
import sys

MAX_Q = 100000
MAX_N = 10**9
MAX_M = 10**9


def size_profile(seed: int) -> tuple[int, int]:
    """Return (max_q, max_n) for this seed's size tier."""
    if seed <= 5:
        return 3, 10
    if seed <= 50:
        return 40, 1000
    if seed <= 500:
        return 2000, 10**6
    return MAX_Q, MAX_N


def edge_rows(max_n: int, max_m: int) -> list[tuple[int, int, int]]:
    """Boundary and degenerate rows, all valid under the stated constraints."""
    n = max_n
    mid = max(1, n // 2)
    rows = [
        (1, 1, 1),
        (1, max_m, 1),
        (n, 1, 1),
        (n, 1, n),
        (n, max_m, 1),
        (n, max_m, n),
        (n, n, 1),
        (n, n, n),
        (n, n, mid),
        (n, 1, mid),
        (mid, 1, 1),
        (mid, max_m, mid),
    ]
    return [(a, b, c) for (a, b, c) in rows if 1 <= c <= a and b >= 1]


def random_row(rng: random.Random, max_n: int, max_m: int) -> tuple[int, int, int]:
    n = rng.randint(1, max_n)
    m = rng.randint(1, max_m)
    s = rng.randint(1, n)
    return (n, m, s)


def build_rows(seed: int) -> list[tuple[int, int, int]]:
    rng = random.Random(seed * 7919 + 13)
    max_q, max_n = size_profile(seed)
    max_m = MAX_M if max_n >= 10**6 else max(1, max_n * 3)

    pool = edge_rows(max_n, max_m)

    if seed % 5 == 0:
        # Edge-case-only input: cycle through the boundary rows.
        count = min(max_q, max(1, len(pool)))
        return [pool[i % len(pool)] for i in range(count)]

    if seed % 7 == 0:
        # Degenerate shape: every row identical.
        count = rng.randint(1, max_q)
        row = random_row(rng, max_n, max_m)
        return [row] * count

    count = rng.randint(1, max_q)
    rows = [random_row(rng, max_n, max_m) for _ in range(count)]

    # Sprinkle a few boundary rows into the random data when there is room.
    for i in range(min(len(rows), len(pool))):
        if rng.random() < 0.2:
            rows[i] = pool[rng.randrange(len(pool))]
    return rows


def main() -> None:
    seed = int(sys.argv[1])
    rows = build_rows(seed)
    out = [str(len(rows))]
    out.extend(f"{n} {m} {s}" for (n, m, s) in rows)
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
