"""Random input generator for "Number Line Jumps".

Usage: python3 generator.py <seed> > case.in

Deterministic per seed. Small seeds produce tiny inputs; large seeds produce
the largest generated tests. Those stay small on purpose (this is a casual
contest): at most MAX_Q pairs, starts up to 1,000 and jumps up to 100. A pair
whose rovers close in at all closes at least one mark per beep, and the gap is
at most 1,000 marks, so any meeting happens within 1,000 beeps on a mark no
larger than about 10^5. A student who simulates the hops one beep at a time for
1,000 beeps finishes well inside the time limit with 32-bit integers.

Which test came from where:
  01, 02        the two statement samples, written by hand (never regenerate)
  03 - 08       hand-written edge cases: all zero, the ends of the strip,
                five identical pairs, both rovers parked, leapfrogs, near misses
  09            seed 37
  10            seed 88
  11            seed 640
  12            seed 977
  13            seed 4001
  14            seed 4002
"""

import random
import sys

MAX_Q = 1000
MAX_START = 1000
MAX_JUMP = 100


def size_for_seed(seed: int) -> tuple[int, int, int]:
    """Return (number of pairs, start limit, jump limit) for this seed."""
    if seed <= 10:
        return (1 + seed % 5, 20, 5)
    if seed <= 100:
        return (10 + seed % 51, 200, 20)
    if seed <= 1000:
        return (200 + seed % 301, 500, 50)
    return (MAX_Q, MAX_START, MAX_JUMP)


def meeting_pair(
    rng: random.Random, start_limit: int, jump_limit: int
) -> tuple[int, int, int, int]:
    """Build a pair that provably meets on some beep k >= 0."""
    j1 = rng.randint(0, jump_limit)
    j2 = rng.randint(0, jump_limit)
    if j1 == j2:
        start = rng.randint(0, start_limit)
        return (start, j1, start, j2)

    closing = j1 - j2
    # Choose k so that both rovers stay inside the coordinate range.
    span = start_limit // max(abs(closing), 1)
    k = rng.randint(0, max(span, 0))
    s1 = rng.randint(0, start_limit)
    s2 = s1 + k * closing
    if not 0 <= s2 <= start_limit:
        # Fall back to a beep-0 meeting rather than leaving the range.
        return (s1, j1, s1, j2)
    return (s1, j1, s2, j2)


def random_pair(
    rng: random.Random, start_limit: int, jump_limit: int
) -> tuple[int, int, int, int]:
    return (
        rng.randint(0, start_limit),
        rng.randint(0, jump_limit),
        rng.randint(0, start_limit),
        rng.randint(0, jump_limit),
    )


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: generator.py <seed>")
    seed = int(sys.argv[1])
    rng = random.Random(seed)

    pairs, start_limit, jump_limit = size_for_seed(seed)
    meet_rate = rng.choice([0.0, 0.1, 0.35, 0.75])

    lines = [str(pairs)]
    for _ in range(pairs):
        if rng.random() < meet_rate:
            s1, j1, s2, j2 = meeting_pair(rng, start_limit, jump_limit)
        else:
            s1, j1, s2, j2 = random_pair(rng, start_limit, jump_limit)
        lines.append(f"{s1} {j1} {s2} {j2}")
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
