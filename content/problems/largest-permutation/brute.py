"""Largest Permutation -- brute-force solution.

Two regimes:

* n <= 6: EXHAUSTIVE search. Try every sequence of at most min(k, n - 1)
  swaps (n - 1 swaps always suffice to reach the fully descending order, which
  no budget can beat) and keep the lexicographically largest array seen,
  including the array itself for "do nothing". Memoised on (state, depth) so
  the 720-permutation state space stays tiny. This is the definition of the
  task with no greedy insight at all, and it is what the stress run compares
  the reference's greedy against.

* n > 6: the exhaustive search cannot finish, and no honest slow variant can
  pass the E-tier largest test either (an O(n * k) rescan-per-swap simulation
  needs on the order of 5e9 list scans at n = k = 1e5). So above the
  exhaustive threshold this falls back to a definition-literal greedy that
  matches reference.py in complexity but not mechanism: a dict from value to
  index instead of a flat array, and an explicit budget counter.
"""

import sys
from functools import lru_cache

EXHAUSTIVE_MAX_N = 6


def exhaustive(a: list[int], k: int) -> list[int]:
    n = len(a)
    depth = min(k, n - 1)

    @lru_cache(maxsize=None)
    def best(state: tuple[int, ...], swaps_left: int) -> tuple[int, ...]:
        top = state
        if swaps_left == 0:
            return top
        s = list(state)
        for i in range(n):
            for j in range(i + 1, n):
                s[i], s[j] = s[j], s[i]
                cand = best(tuple(s), swaps_left - 1)
                if cand > top:
                    top = cand
                s[i], s[j] = s[j], s[i]
        return top

    return list(best(tuple(a), depth))


def greedy_fallback(a: list[int], k: int) -> list[int]:
    n = len(a)
    where = {v: i for i, v in enumerate(a)}
    budget = k
    for i in range(n):
        if budget == 0:
            break
        want = n - i
        j = where[want]
        if j == i:
            continue
        where[a[i]] = j
        where[want] = i
        a[i], a[j] = a[j], a[i]
        budget -= 1
    return a


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    k = int(data[1])
    a = [int(x) for x in data[2 : 2 + n]]

    result = exhaustive(a, k) if n <= EXHAUSTIVE_MAX_N else greedy_fallback(a, k)

    sys.stdout.write(" ".join(map(str, result)))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
