"""Library Shelf Shuffle -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds give short logs; the ceiling of 10^5 events is reached
by seed 12 and above. The seed also selects a shape so the test set covers a cart that is
mostly empty when volunteers come, a cart that is never empty, a log that is all returns
followed by all visits, long runs of the same call number, and uniformly mixed logs.
Every log has at least one visit, as the constraints promise.
"""

import random
import sys

MAX_N = 100_000
MAX_CALL = 1_000_000


def choose_n(seed, rng):
    if seed <= 4:
        return rng.randint(1, 8)
    if seed <= 8:
        return rng.randint(10, 400)
    if seed <= 11:
        return rng.randint(5_000, 60_000)
    return MAX_N


def build_events(seed, n, rng):
    shape = seed % 6

    if shape == 0:
        # Uniform mix: about half returns, half visits.
        events = [rng.randint(1, MAX_CALL) if rng.random() < 0.5 else 0 for _ in range(n)]
    elif shape == 1:
        # Visits dominate, so most of them find an empty cart.
        events = [rng.randint(1, MAX_CALL) if rng.random() < 0.2 else 0 for _ in range(n)]
    elif shape == 2:
        # Returns first, then visits take everything back off, deepest stack possible.
        half = n // 2
        events = [rng.randint(1, MAX_CALL) for _ in range(half)] + [0] * (n - half)
    elif shape == 3:
        # Returns dominate: the cart is never empty after the first book.
        events = [rng.randint(1, MAX_CALL) if rng.random() < 0.8 else 0 for _ in range(n)]
        events[0] = rng.randint(1, MAX_CALL)
    elif shape == 4:
        # Long runs of one call number, with visits in bursts.
        events = []
        while len(events) < n:
            run = rng.randint(1, max(1, n // 20))
            if rng.random() < 0.55:
                events.extend([rng.randint(1, MAX_CALL)] * run)
            else:
                events.extend([0] * run)
        events = events[:n]
    else:
        # Strict alternation return, visit, return, visit: the cart never holds two books.
        events = [rng.randint(1, MAX_CALL) if i % 2 == 0 else 0 for i in range(n)]

    # At least one visit, as the constraints promise.
    if 0 not in events:
        events[rng.randrange(n)] = 0
    return events


def main():
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed, rng)
    events = build_events(seed, n, rng)
    assert len(events) == n
    assert 0 in events
    assert all(0 <= e <= MAX_CALL for e in events)
    sys.stdout.write(f"{n}\n")
    sys.stdout.write(" ".join(map(str, events)) + "\n")


if __name__ == "__main__":
    main()
