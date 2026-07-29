import random
import sys

N_MIN, N_MAX = 2, 200000
K_MIN, K_MAX = 1, 100
T_MIN, T_MAX = 1, 1000000000


def choose_n(seed, rng):
    """Small seeds give small inputs; large seeds push toward the ceiling."""
    if seed <= 9:
        return rng.randint(N_MIN, 12)
    if seed <= 99:
        return rng.randint(20, 400)
    if seed <= 999:
        return rng.randint(1000, 30000)
    return rng.randint(N_MAX - 500, N_MAX)


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
