"""Hall Pass Ledger -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds produce short ledgers. The ramp climbs toward RAMP_N
signatures as the seed approaches 1000, and every ledger is clamped to MAX_N, so seeds past
about 10 already reach the ceiling. The seed also picks the shape of the ledger so the test
set covers a single student making many trips, many students who each sign once and stay
out, trips that open and close in the same minute, a closing bell that lands on the last
signature, and the biggest ledger the constraints allow.

The ceiling is a casual contest size: a student who loops over every distinct name and
rescans the whole ledger for each one still finishes well inside the time limit. Every
minute and every total is at most 1440, so nothing comes near a 32-bit int.

Tests 01 and 02 are the hand-written samples from the statement. The rest come from these
seeds:

    03: 0     one signature, still out at closing
    04: 1     everyone signs once, all in the same minute
    05: 2     three students with several trips each
    06: 4     six students, every signature in one minute
    07: 7     two lookalike names ("a" and "aa"), every signature in one minute
    08: 8     one student making many trips, closing on the last signature
    09: 15    nearly everyone signs once and stays out, all in one minute
    10: 77    the ceiling, nearly everyone signs once, spread over the day
    11: 127   a large roster with repeat visitors, closing at 1440 on the last signature
    12: 350   the ceiling, a lookalike roster from a tiny alphabet across the whole day
    13: 1004  the ceiling, a large roster, closing on the last signature
    14: 1009  the ceiling, closing at 1440 one minute after the last signature
    15: 1012  the ceiling, one student making every trip
    16: 1006  the ceiling, a large roster, closing on the last signature
"""

import random
import string
import sys

MAX_N = 1_000
RAMP_N = 100_000
MAX_CLOSING = 1440
MAX_NAME = 12

LETTERS = string.ascii_lowercase


def scale(seed: int) -> float:
    """0.0 for tiny seeds, 1.0 once the seed reaches 1000."""
    return min(seed, 1000) / 1000.0


def pick_name(rng: random.Random, max_len: int) -> str:
    length = rng.randint(1, max_len)
    return "".join(rng.choice(LETTERS) for _ in range(length))


def pick_roster(rng: random.Random, n: int, shape: float) -> list[str]:
    if shape < 0.15:
        return [pick_name(rng, MAX_NAME)]
    if shape < 0.30:
        # Everybody signs exactly once, so everybody is still out at closing.
        return [pick_name(rng, MAX_NAME) for _ in range(n)]
    if shape < 0.45:
        # A small roster from a tiny alphabet: lots of lookalike names that must stay distinct.
        count = rng.randint(2, min(n, 8))
        roster = set()
        while len(roster) < count:
            roster.add("".join(rng.choice("ab") for _ in range(rng.randint(1, 3))))
        return sorted(roster)
    count = rng.randint(1, max(1, n // 3))
    return [pick_name(rng, MAX_NAME) for _ in range(count)]


def pick_minutes(rng: random.Random, n: int, closing: int, shape: float) -> list[int]:
    if shape < 0.20:
        # Every signature in the same minute: every closed trip is 0 minutes long.
        minute = rng.randint(0, closing)
        return [minute] * n
    if shape < 0.40:
        # Dense ledger: many signatures share minutes.
        minutes = sorted(rng.randint(0, closing) for _ in range(n))
        return minutes
    minutes = sorted(rng.randint(0, closing) for _ in range(n))
    if shape < 0.60 and n > 0:
        # The closing bell lands exactly on the last signature.
        minutes[-1] = closing
    return minutes


def main() -> None:
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    t = scale(seed)

    n = min(MAX_N, rng.randint(1, max(1, int(round(1 + t * (RAMP_N - 1))))))
    if t >= 1.0 and rng.random() < 0.5:
        n = MAX_N
    closing = rng.randint(1, MAX_CLOSING) if rng.random() < 0.8 else MAX_CLOSING

    roster = pick_roster(rng, n, rng.random())
    if len(roster) >= n:
        names = roster[:n]
    else:
        names = [rng.choice(roster) for _ in range(n)]
    minutes = pick_minutes(rng, n, closing, rng.random())

    assert len(names) == n and len(minutes) == n
    assert all(0 <= m <= closing for m in minutes)
    assert all(minutes[i] <= minutes[i + 1] for i in range(n - 1))

    sys.stdout.write(f"{n} {closing}\n")
    sys.stdout.write(" ".join(names) + "\n")
    sys.stdout.write(" ".join(str(m) for m in minutes) + "\n")


if __name__ == "__main__":
    main()
