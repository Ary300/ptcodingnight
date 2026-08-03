"""Luck Balance -- reference solution.

Lose every unimportant contest (pure gain). Sort the important contests by
luck descending, lose the k largest, win the rest. Since every luck value is
positive, losing as many important contests as allowed is always optimal.
"""

import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    k = int(data[1])

    balance = 0
    important: list[int] = []
    idx = 2
    for _ in range(n):
        luck = int(data[idx])
        flag = int(data[idx + 1])
        idx += 2
        if flag == 1:
            important.append(luck)
        else:
            balance += luck

    important.sort(reverse=True)
    balance += sum(important[:k])
    balance -= sum(important[k:])
    print(balance)


if __name__ == "__main__":
    main()
