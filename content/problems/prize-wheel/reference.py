import sys
from collections import deque


def solve(n, a):
    k = len(set(a))
    m = 3 * n
    b = [a[i % n] for i in range(m)]
    # f[s] = smallest e >= s such that b[s..e] holds every value (two pointers).
    f = [m] * m
    cnt = [0] * (n + 1)
    have = 0
    e = -1
    for s in range(m):
        while have < k and e + 1 < m:
            e += 1
            if cnt[b[e]] == 0:
                have += 1
            cnt[b[e]] += 1
        if have == k:
            f[s] = e
        cnt[b[s]] -= 1
        if cnt[b[s]] == 0:
            have -= 1
    out = []
    # j runs over the middle copy. g = largest s <= j with f[s] <= j (non-decreasing in j).
    g = -1
    qa = deque()  # min of f[s] - 2s over s in (g, j]
    qb = deque()  # min of 2f[s] - s over s in (g, j]
    for j in range(2 * n):
        while g + 1 <= j and f[g + 1] <= j:
            g += 1
        va = f[j] - 2 * j
        while qa and f[qa[-1]] - 2 * qa[-1] >= va:
            qa.pop()
        qa.append(j)
        vb = 2 * f[j] - j
        while qb and 2 * f[qb[-1]] - qb[-1] >= vb:
            qb.pop()
        qb.append(j)
        while qa and qa[0] <= g:
            qa.popleft()
        while qb and qb[0] <= g:
            qb.popleft()
        if j < n:
            continue
        best = j - g
        if qa:
            s = qa[0]
            best = min(best, f[s] - 2 * s + j)
        if qb:
            s = qb[0]
            best = min(best, 2 * f[s] - s - j)
        out.append(best)
    return out


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]
    sys.stdout.write(" ".join(map(str, solve(n, a))) + "\n")


if __name__ == "__main__":
    main()
