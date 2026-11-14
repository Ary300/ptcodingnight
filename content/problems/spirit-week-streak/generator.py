"""Spirit Week Streak -- input generator.

Usage: python3 generator.py <seed>

Deterministic per seed. Small seeds give a handful of days; seed 12 and above hit the 10^5
ceiling. The seed also selects a shape so the test set covers logs where no day meets the
goal, logs where every day does (one streak of maximum length and total), logs built from
many streaks of the same length so the total has to break the tie, counts sitting exactly on
the goal, and uniformly random logs.
"""

import random
import sys

MAX_N = 100_000
MAX_COUNT = 5000
MAX_GOAL = 5000


def choose_n(seed, rng):
    if seed <= 4:
        return rng.randint(1, 10)
    if seed <= 8:
        return rng.randint(12, 500)
    if seed <= 11:
        return rng.randint(5_000, 60_000)
    return MAX_N


def build_log(seed, n, rng):
    shape = seed % 6

    if shape == 0:
        # Uniform random counts against a mid-range goal.
        goal = rng.randint(1, MAX_GOAL)
        counts = [rng.randint(0, MAX_COUNT) for _ in range(n)]
    elif shape == 1:
        # Goal above every count: the answer is 0 0.
        goal = rng.randint(MAX_COUNT // 2 + 1, MAX_GOAL)
        counts = [rng.randint(0, goal - 1) for _ in range(n)]
    elif shape == 2:
        # Every day is a hit: one streak of length n, total is the whole sum.
        goal = rng.randint(1, MAX_GOAL // 2)
        counts = [rng.randint(goal, MAX_COUNT) for _ in range(n)]
    elif shape == 3:
        # Equal-length streaks separated by single misses, so only the total decides.
        goal = rng.randint(1, MAX_GOAL // 2)
        run = rng.randint(1, 5)
        counts = []
        while len(counts) < n:
            counts.extend(rng.randint(goal, MAX_COUNT) for _ in range(run))
            counts.append(rng.randint(0, goal - 1))
        counts = counts[:n]
    elif shape == 4:
        # Counts hover right at the goal: exactly g, g-1 and g+1 only.
        goal = rng.randint(2, MAX_GOAL - 1)
        counts = [goal + rng.choice([-1, 0, 0, 1]) for _ in range(n)]
    else:
        # Long streaks with occasional misses.
        goal = rng.randint(1, MAX_GOAL // 2)
        counts = []
        while len(counts) < n:
            streak = rng.randint(1, max(1, n // 8))
            counts.extend(rng.randint(goal, MAX_COUNT) for _ in range(streak))
            counts.append(rng.randint(0, goal - 1))
        counts = counts[:n]

    return goal, counts


def main():
    seed = int(sys.argv[1])
    rng = random.Random(seed)
    n = choose_n(seed, rng)
    goal, counts = build_log(seed, n, rng)
    assert len(counts) == n
    assert 1 <= goal <= MAX_GOAL
    assert all(0 <= c <= MAX_COUNT for c in counts)
    sys.stdout.write(f"{n} {goal}\n")
    sys.stdout.write(" ".join(map(str, counts)) + "\n")


if __name__ == "__main__":
    main()
