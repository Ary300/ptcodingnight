"""Snack Bar Change -- reference solution.

Greedy: when 4 dollars of change is owed, spend 2-dollar bills before 1-dollar bills. A
2-dollar bill can only ever be used for a 5-dollar customer, while a 1-dollar bill serves
either kind, so keeping the 1s is never worse. The drawer state after any prefix under this
rule dominates the state under any other rule, which makes "the first student who cannot be
served no matter what" the same student the greedy stops at.
"""

import sys

PRICE = 1
OK = "ok"


def first_unserved(ones, twos, bills):
    for position, bill in enumerate(bills, start=1):
        change = bill - PRICE
        if change == 0:
            ones += 1
        elif change == 1:
            if ones == 0:
                return str(position)
            ones -= 1
            twos += 1
        else:
            # change == 4: prefer two 2s, then one 2 plus two 1s, then four 1s.
            if twos >= 2:
                twos -= 2
            elif twos == 1 and ones >= 2:
                twos -= 1
                ones -= 2
            elif ones >= 4:
                ones -= 4
            else:
                return str(position)
    return OK


def main():
    tokens = sys.stdin.read().split()
    t = int(tokens[0])
    pos = 1
    answers = []
    for _ in range(t):
        n, ones, twos = int(tokens[pos]), int(tokens[pos + 1]), int(tokens[pos + 2])
        pos += 3
        bills = [int(x) for x in tokens[pos : pos + n]]
        pos += n
        answers.append(first_unserved(ones, twos, bills))
    sys.stdout.write("\n".join(answers) + "\n")


if __name__ == "__main__":
    main()
