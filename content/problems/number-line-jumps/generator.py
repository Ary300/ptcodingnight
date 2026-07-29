"""Random input generator for "Number Line Jumps".

Usage: python3 generator.py <seed> > case.in

Deterministic per seed. Small seeds produce tiny inputs; large seeds push the
input toward the constraint ceiling.
"""

import random
import sys

MAX_Q = 20000
MAX_START = 10 ** 9
MAX_JUMP = 10 ** 6


def size_for_seed(seed: int) -> tuple[int, int, int]:
    """Return (number of pairs, start limit, jump limit) for this seed."""
    if seed <= 10:
        return (1 + seed % 5, 20, 5)
    if seed <= 100:
        return (10 + seed % 51, 1000, 50)
    if seed <= 1000:
        return (500 + seed % 2501, 10 ** 6, 1000)
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
