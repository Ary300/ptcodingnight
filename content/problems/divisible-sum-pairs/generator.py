"""Test generator for Divisible Sum Pairs.

Usage: python3 generator.py <seed>

Which test came from where:
  01, 02  the two samples, hand-written (shown in statement.md)
  03      hand-written: n = 2, k = 100, no pair works
  04      hand-written: five identical gears, k = 2, every pair works
  05      hand-written: n = 2, k = 1, both gears at T_MAX
  06      seed 7     k = 1, tight value range
  07      seed 1     k = 100, every gear identical, answer 0
  08      seed 3     every gear a multiple of k
  09      seed 42    n = 347, k = 1, tight value range
  10      seed 101   moderate n, every gear identical, answer 0
  11      seed 555   moderate n, fully random
  12      seed 1009  largest n, k = 100, only two remainder classes (50 and another)
  13      seed 1238  largest n, k = 64, every gear a multiple of k
  14      seed 1001  largest n, k = 1, every gear identical, every pair works

Bounds are sized for a casual contest: n stays at most 1,000 so the
obvious double loop over all pairs is fast, and tooth counts stay at most
1,000,000 so every sum and the answer (at most 499,500) fit in a 32-bit int.
"""
import random
import sys

N_MIN, N_MAX = 2, 1000
K_MIN, K_MAX = 1, 100
T_MIN, T_MAX = 1, 1000000


def choose_n(seed, rng):
    """Small seeds give small inputs; large seeds push toward the ceiling."""
    if seed <= 9:
        return rng.randint(N_MIN, 12)
    if seed <= 99:
        return rng.randint(20, 400)
    if seed <= 999:
        return rng.randint(400, 800)
    return rng.randint(N_MAX - 50, N_MAX)


def choose_k(seed, rng):
    if seed % 7 == 0:
        return K_MIN
    if seed % 7 == 1:
        return K_MAX
    if seed <= 9:
        return rng.randint(K_MIN, 6)
    return rng.randint(K_MIN, K_MAX)


def build_teeth(n, k, mode, rng):
    if mode == 0:
        # Fully random over the whole allowed range.
        return [rng.randint(T_MIN, T_MAX) for _ in range(n)]
    if mode == 1:
        # Every gear identical.
        v = rng.randint(T_MIN, T_MAX)
        return [v] * n
    if mode == 2:
        # Tight value range, so remainder classes collide a lot.
        lo = rng.randint(T_MIN, 50)
        return [rng.randint(lo, lo + 5) for _ in range(n)]
    if mode == 3:
        # Everything is already a multiple of k (or near it).
        out = []
        for _ in range(n):
            m = rng.randint(1, T_MAX // k)
            out.append(min(T_MAX, m * k))
        return out
    # mode 4: only two remainder classes, which pair with each other.
    a = rng.randint(T_MIN, T_MAX // 2)
    b = min(T_MAX, a + k - (a % k) + (k // 2 if k > 1 else 0))
    b = max(T_MIN, min(T_MAX, b))
    return [a if rng.random() < 0.5 else b for _ in range(n)]


def main():
    seed = int(sys.argv[1])
    rng = random.Random(seed)

    n = choose_n(seed, rng)
    k = choose_k(seed, rng)
    mode = seed % 5
    teeth = build_teeth(n, k, mode, rng)

    assert N_MIN <= n <= N_MAX
    assert K_MIN <= k <= K_MAX
    assert all(T_MIN <= t <= T_MAX for t in teeth)
    assert len(teeth) == n

    out = sys.stdout
    out.write("%d %d\n" % (n, k))
    out.write(" ".join(str(t) for t in teeth))
    out.write("\n")


main()
