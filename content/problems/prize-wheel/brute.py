# Independent check: breadth-first search over actual turns of the wheel.
import sys
from collections import deque


def solve(n, a):
    k = len(set(a))
    res = []
    for j in range(n):
        # state: (offset of pointer from j, lowest offset seen, highest offset seen)
        start = (0, 0, 0)
        dist = {start: 0}
        dq = deque([start])
        ans = None
        while dq:
            st = dq.popleft()
            p, lo, hi = st
            seen = {a[(j + x) % n] for x in range(lo, hi + 1)}
            if len(seen) == k:
                ans = dist[st]
                break
            for d in (-1, 1):
                q = p + d
                if abs(q) > n:
                    continue
                ns = (q, min(lo, q), max(hi, q))
                if ns not in dist:
                    dist[ns] = dist[st] + 1
                    dq.append(ns)
        res.append(ans)
    return res


data = sys.stdin.read().split()
n = int(data[0])
a = [int(x) for x in data[1:1 + n]]
print(" ".join(map(str, solve(n, a))))
