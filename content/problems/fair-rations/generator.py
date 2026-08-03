"""Fair Rations -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short lines; large seeds push n to
the constraint ceiling. The seed also selects the shape of the line so the test
set covers degenerate cases (single person, all counts even, all counts odd,
alternating parity, two odd counts at opposite ends, guaranteed-NO parity) and
not just uniform noise.
"""

import random
import sys

MAX_N = 100000
MAX_B = 1000


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 person, seed >= 317 -> the ceiling."""
    return max(1, min(MAX_N, seed * seed))


def even_value(rng: random.Random) -> int:
    return rng.randrange(2, MAX_B + 1, 2)


def odd_value(rng: random.Random) -> int:
    return rng.randrange(1, MAX_B + 1, 2)


def build_line(seed: int, n: int, rng: random.Random) -> list[int]:
    shape = seed % 7

    if shape == 0:
        # Uniform noise over the full value range.
        return [rng.randint(1, MAX_B) for _ in range(n)]

    if shape == 1:
        # Everyone already even: the answer is 0.
        return [even_value(rng) for _ in range(n)]

    if shape == 2:
        # Everyone odd: NO when n is odd, dense pairing when n is even.
        return [odd_value(rng) for _ in range(n)]

    if shape == 3:
        # Alternating parity along the line.
        return [odd_value(rng) if i % 2 == 0 else even_value(rng) for i in range(n)]

    if shape == 4:
        # Exactly two odd counts, pushed to opposite ends: maximal chain.
        line = [even_value(rng) for _ in range(n)]
        line[0] = odd_value(rng)
        line[-1] = odd_value(rng)
        if n == 1:
            line[0] = even_value(rng)
        return line

    if shape == 5:
        # Guaranteed NO: force an odd number of odd counts.
        line = [rng.randint(1, MAX_B) for _ in range(n)]
        odd_count = sum(c % 2 for c in line)
        if odd_count % 2 == 0:
            i = rng.randrange(n)
            line[i] = odd_value(rng) if line[i] % 2 == 0 else even_value(rng)
        return line

    # shape == 6: sparse odd counts scattered through a mostly even line.
    line = [even_value(rng) for _ in range(n)]
    scattered = rng.randint(0, max(1, n // 20))
    for i in rng.sample(range(n), min(n, 2 * scattered)):
        line[i] = odd_value(rng)
    return line


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed)
    line = build_line(seed, n, rng)
    assert len(line) == n
    assert all(1 <= c <= MAX_B for c in line)
    out = sys.stdout
    out.write(f"{n}\n")
    out.write(" ".join(str(c) for c in line))
    out.write("\n")


if __name__ == "__main__":
    main()
