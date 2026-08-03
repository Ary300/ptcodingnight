"""Luck Balance -- brute-force checker.

Neither branch assumes the reference's greedy shortcut (that losing exactly
min(k, m) important contests is optimal):

- For n <= EXHAUSTIVE_LIMIT, enumerate every win/lose assignment over all
  contests, discard those losing more than k important ones, take the best.
  This is the definition of the task, executed literally.
- For larger inputs (the exhaustive search cannot finish), explicitly try
  every allowed count j of important losses from 0 to min(k, m); for a fixed
  j the best plan is to lose the j largest important contests, which prefix
  sums evaluate in O(1) each. Unimportant contests are always lost.
"""

import sys
from itertools import product

EXHAUSTIVE_LIMIT = 18


def exhaustive(k: int, contests: list[tuple[int, int]]) -> int:
    best: int | None = None
    n = len(contests)
    for mask in product((0, 1), repeat=n):  # 1 = lose, 0 = win
        lost_important = sum(
            1 for (_, flag), lose in zip(contests, mask) if lose and flag == 1
        )
        if lost_important > k:
            continue
        total = sum(
            luck if lose else -luck for (luck, _), lose in zip(contests, mask)
        )
        if best is None or total > best:
            best = total
    assert best is not None  # losing nothing important is always allowed
    return best


def try_all_loss_counts(k: int, contests: list[tuple[int, int]]) -> int:
    unimportant_gain = sum(luck for luck, flag in contests if flag == 0)
    imp = sorted((luck for luck, flag in contests if flag == 1), reverse=True)
    total_imp = sum(imp)

    lost_sum = 0
    best = unimportant_gain - total_imp  # j = 0: win every important contest
    for j in range(1, min(k, len(imp)) + 1):
        lost_sum += imp[j - 1]
        candidate = unimportant_gain + lost_sum - (total_imp - lost_sum)
        best = max(best, candidate)
    return best


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    k = int(data[1])
    contests = [
        (int(data[2 + 2 * i]), int(data[3 + 2 * i])) for i in range(n)
    ]

    if n <= EXHAUSTIVE_LIMIT:
        print(exhaustive(k, contests))
    else:
        print(try_all_loss_counts(k, contests))


if __name__ == "__main__":
    main()
