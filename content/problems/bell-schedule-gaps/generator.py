"""Bell Schedule Gaps -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce a handful of commitments; the size ceiling of
1,000 commitments is reached once the seed passes 1000. The seed also picks the shape of the
day so the test set covers a single commitment, a day covered end to end (answer 0), nested
commitments that punish the sort-and-look-at-neighbours shortcut, blocks that touch exactly,
a crowded day where every block falls inside a few windows so a real gap survives at the
largest n, and the biggest schedule the constraints allow.

The ceiling is kept moderate on purpose: this is a casual contest, so a student who marks
every busy minute of the day in a list still passes. Every value is a minute of the day, so
nothing comes near the 32-bit range.

Tests 01 and 02 are the hand-written samples from statement.md. The rest come from:

    03  seed 0     n=1      one commitment, three-quarters shape
    04  seed 16    n=12     one block covers the whole day (answer 0)
    05  seed 2     n=1      clustered, day starts mid-afternoon
    06  seed 492   n=413    blocks fill about three quarters of the day
    07  seed 481   n=348    clustered into a few windows over a full day
    08  seed 17    n=17     nested
    09  seed 40    n=30     nested
    10  seed 350   n=186    nested
    11  seed 900   n=640    clustered
    12  seed 1022  n=1000   short scattered blocks that still cover every minute (answer 0)
    13  seed 1006  n=1000   nested
    14  seed 1011  n=1000   nested, an 88-minute day
    15  seed 1012  n=1000   clustered, a 66-minute day
    16  seed 1007  n=1000   clustered
"""

import random
import sys

MAX_N = 1_000
MAX_MINUTE = 1440


def scale(seed: int) -> float:
    """0.0 for tiny seeds, 1.0 once the seed reaches 1000."""
    return min(seed, 1000) / 1000.0


def random_block(rng: random.Random, lo: int, hi: int, max_len: int) -> tuple[int, int]:
    start = rng.randint(lo, hi - 1)
    end = rng.randint(start + 1, min(hi, start + max_len))
    return start, end


def build(rng: random.Random, n: int, first: int, last: int, shape: float) -> list[tuple[int, int]]:
    span = last - first
    if shape < 0.12:
        # One block covers the whole day: every minute is busy.
        return [(first, last)] + [random_block(rng, first, last, span) for _ in range(n - 1)]
    if shape < 0.27:
        # Blocks that touch exactly, back to back, with no free minute between them.
        cuts = sorted(rng.sample(range(first + 1, last), min(n - 1, span - 1))) if span > 1 else []
        points = [first] + cuts + [last]
        blocks = [(points[i], points[i + 1]) for i in range(len(points) - 1)]
        while len(blocks) < n:
            blocks.append(random_block(rng, first, last, span))
        rng.shuffle(blocks)
        return blocks
    if shape < 0.45:
        # Nested blocks: one long one with short ones inside it.
        outer = random_block(rng, first, last, span)
        blocks = [outer]
        for _ in range(n - 1):
            blocks.append(random_block(rng, outer[0], outer[1], max(1, (outer[1] - outer[0]) // 2)))
        rng.shuffle(blocks)
        return blocks
    if shape < 0.60:
        # Short blocks scattered over the day: lots of real gaps.
        return [random_block(rng, first, last, max(1, span // 20)) for _ in range(n)]
    if shape < 0.80:
        # Clustered: every block falls inside one of a few windows, so even a thousand
        # commitments leave the minutes between the windows free.
        windows = rng.randint(1, 4)
        cuts = sorted(rng.sample(range(first + 1, last), min(2 * windows, span - 1))) if span > 2 else []
        bounds = [(cuts[i], cuts[i + 1]) for i in range(0, len(cuts) - 1, 2)]
        if not bounds:
            bounds = [(first, last)]
        blocks = []
        for _ in range(n):
            lo, hi = rng.choice(bounds)
            blocks.append(random_block(rng, lo, hi, hi - lo))
        return blocks
    # Blocks sized so roughly three quarters of the day ends up busy.
    max_len = max(1, (3 * span) // (2 * n))
    return [random_block(rng, first, last, max_len) for _ in range(n)]


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    t = scale(seed)

    n = rng.randint(1, max(1, int(round(1 + t * (MAX_N - 1)))))
    if t >= 1.0 and rng.random() < 0.5:
        n = MAX_N
    first = rng.randint(0, MAX_MINUTE - 1) if rng.random() < 0.5 else 0
    last = rng.randint(first + 1, MAX_MINUTE) if rng.random() < 0.7 else MAX_MINUTE

    blocks = build(rng, n, first, last, rng.random())

    assert len(blocks) == n
    assert all(first <= l < r <= last for l, r in blocks)

    sys.stdout.write(f"{n} {first} {last}\n")
    sys.stdout.write(" ".join(str(l) for l, _ in blocks) + "\n")
    sys.stdout.write(" ".join(str(r) for _, r in blocks) + "\n")


if __name__ == "__main__":
    main()
