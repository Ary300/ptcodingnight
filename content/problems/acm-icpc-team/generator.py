"""ACM ICPC Team -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. The seed picks a shape and a size band so that the test
set covers the degenerate corners (minimum n, single topic, nobody knows
anything, everybody knows everything, identical checklists, complementary
pairs, one student who already knows every topic) as well as random matrices
at several densities, up to the full 500x500 ceiling.
"""

import random
import sys

MAX_N = 500
MAX_M = 500


def choose_size(seed: int, rng: random.Random) -> tuple[int, int]:
    band = seed % 4
    if band == 0:
        return rng.randint(2, 8), rng.randint(1, 8)
    if band == 1:
        return rng.randint(2, 60), rng.randint(1, 60)
    if band == 2:
        return rng.randint(50, 300), rng.randint(50, 300)
    return MAX_N, MAX_M


def build_rows(seed: int, n: int, m: int, rng: random.Random) -> list[str]:
    shape = seed % 7

    if shape == 0:
        # Nobody knows anything: the max is 0 and every pair ties.
        return ["0" * m for _ in range(n)]

    if shape == 1:
        # Everybody knows everything: full coverage, every pair ties.
        return ["1" * m for _ in range(n)]

    if shape == 2:
        # One checklist duplicated for the whole roster.
        row = "".join(rng.choice("01") for _ in range(m))
        return [row] * n

    if shape == 3:
        # Complementary halves: rows and their bitwise negations, so many
        # cross pairs cover all m topics.
        rows = []
        for _ in range((n + 1) // 2):
            row = "".join(rng.choice("01") for _ in range(m))
            rows.append(row)
            rows.append("".join("1" if c == "0" else "0" for c in row))
        return rows[:n]

    if shape == 4:
        # One student already knows every topic, buried in sparse noise, so
        # the winning pairs all involve that one student.
        rows = [
            "".join("1" if rng.random() < 0.05 else "0" for _ in range(m))
            for _ in range(n - 1)
        ]
        rows.append("1" * m)
        rng.shuffle(rows)
        return rows

    if shape == 5:
        # Dense random: most pairs land within a bit or two of m.
        return [
            "".join("1" if rng.random() < 0.9 else "0" for _ in range(m))
            for _ in range(n)
        ]

    # shape == 6: uniform random at 50% density.
    return ["".join(rng.choice("01") for _ in range(m)) for _ in range(n)]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n, m = choose_size(seed, rng)
    rows = build_rows(seed, n, m, rng)

    assert len(rows) == n
    assert all(len(r) == m for r in rows)
    assert all(set(r) <= {"0", "1"} for r in rows)

    out = sys.stdout
    out.write(f"{n} {m}\n")
    for row in rows:
        out.write(row + "\n")


if __name__ == "__main__":
    main()
