"""Larry's Array -- brute force.

Breadth-first search over every arrangement reachable from the starting shelf by
the allowed operation, answering YES exactly when the sorted arrangement is
reached. This is the definition of the problem executed literally, with no
insight about parity, so it is the ground truth for stress testing. It is only
usable for tiny n (the state space is n factorial).
"""

import sys
from collections import deque


def reachable_sorted(start: tuple[int, ...]) -> bool:
    n = len(start)
    target = tuple(range(1, n + 1))
    if start == target:
        return True
    if n < 3:
        return False
    seen = {start}
    queue = deque([start])
    while queue:
        cur = queue.popleft()
        for i in range(n - 2):
            nxt = cur[:i] + (cur[i + 1], cur[i + 2], cur[i]) + cur[i + 3:]
            if nxt == target:
                return True
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return False


def main() -> None:
    data = sys.stdin.buffer.read().split()
    q = int(data[0])
    pos = 1
    answers = []
    for _ in range(q):
        n = int(data[pos])
        pos += 1
        perm = tuple(int(x) for x in data[pos:pos + n])
        pos += n
        answers.append("YES" if reachable_sorted(perm) else "NO")
    sys.stdout.write("\n".join(answers) + "\n")


if __name__ == "__main__":
    main()
