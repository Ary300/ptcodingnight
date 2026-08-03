"""Panthers in a String -- definition-literal cross-check.

The task is O(n) by nature, so no meaningfully slower correct variant
exists. This implementation is the most definition-literal alternative:
for each letter of "panthers" in turn, take the EARLIEST occurrence
strictly after the previous chosen position, using str.find. The greedy
earliest choice is safe because any valid selection can be shifted left
letter by letter without breaking order. Mechanically different from the
reference (per-letter find versus a single manual scan), same complexity.
"""

import sys

TARGET = "panthers"


def is_subsequence(s: str) -> bool:
    pos = -1
    for letter in TARGET:
        pos = s.find(letter, pos + 1)
        if pos == -1:
            return False
    return True


def main() -> None:
    data = sys.stdin.read().split()
    q = int(data[0])
    answers = ["YES" if is_subsequence(data[i]) else "NO" for i in range(1, q + 1)]
    sys.stdout.write("\n".join(answers) + "\n")


if __name__ == "__main__":
    main()
