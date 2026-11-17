"""Fair Rations -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short lines; large seeds push n to
the constraint ceiling. The seed also selects the shape of the line so the test
set covers degenerate cases (single person, all counts even, all counts odd,
alternating parity, two odd counts at opposite ends, guaranteed-NO parity) and
not just uniform noise.

Tests 01-12 are written by hand (01 and 02 are the statement's samples). The
generated tests come from these seeds:

    13  seed 41   shape 6, sparse odd counts       n = 1000
    14  seed 63   shape 0, uniform noise           n = 1000
    15  seed 40   shape 5, guaranteed NO           n = 1000
    16  seed 24   shape 3, alternating parity      n = 576
    17  seed 249  shape 4, odd counts at both ends n = 1000
    18  seed 315  shape 0, uniform noise           n = 1000

Seeds 63 and 315 replace the old 42 and 322 because, once n is capped, those
two happen to land on NO, and 15 already covers NO at full size. The ceiling
is 1000 people. This is a casual contest, and an O(n) sweep needs
no large input to separate it from anything else a student would write.
"""

import random
import sys

MAX_N = 1000
MAX_B = 1000


def choose_n(seed: int) -> int:
    """Grow with the seed: seed 1 -> 1 person, seed >= 32 -> the ceiling."""
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
