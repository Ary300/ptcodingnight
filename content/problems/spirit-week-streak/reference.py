"""Spirit Week Streak -- reference solution.

One pass. Extend the current streak while counts stay at or above the goal, close it when a
day misses, and keep the best (length, total) pair seen so far. Ties on length go to the
larger total; a later streak only replaces the best when it is strictly better, which is what
makes the earliest winner the one that stands.
"""

import sys


def best_streak(goal, counts):
    best_len = 0
    best_total = 0
    run_len = 0
    run_total = 0
    for c in counts + [-1]:
        if c >= goal:
            run_len += 1
            run_total += c
            continue
        if run_len > best_len or (run_len == best_len and run_total > best_total):
            best_len, best_total = run_len, run_total
        run_len = 0
        run_total = 0
    return best_len, best_total


def main():
    tokens = sys.stdin.read().split()
    n, goal = int(tokens[0]), int(tokens[1])
    counts = [int(t) for t in tokens[2 : 2 + n]]
    length, total = best_streak(goal, counts)
    sys.stdout.write(f"{length} {total}\n")


if __name__ == "__main__":
    main()
