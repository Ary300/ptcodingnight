"""Weighted Uniform Strings -- reference solution.

Record the longest run of each letter in one pass. A queried weight x is
achievable exactly when some letter with weight w divides x and the required
run length x / w fits inside the longest run of that letter, so each query
costs at most 26 divisibility checks.
"""

import sys

ALPHABET = 26


def main() -> None:
    data = sys.stdin.buffer.read().split()
    s = data[0].decode()
    q = int(data[1])
    queries = [int(x) for x in data[2:2 + q]]

    longest_run = [0] * ALPHABET
    run = 0
    prev = ""
    for ch in s:
        run = run + 1 if ch == prev else 1
        prev = ch
        idx = ord(ch) - 97
        if run > longest_run[idx]:
            longest_run[idx] = run

    answers = []
    for x in queries:
        achievable = False
        for idx in range(ALPHABET):
            weight = idx + 1
            if longest_run[idx] > 0 and x % weight == 0 and x // weight <= longest_run[idx]:
                achievable = True
                break
        answers.append("Yes" if achievable else "No")
    sys.stdout.write("\n".join(answers) + "\n")


if __name__ == "__main__":
    main()
