"""Panthers in a String -- reference solution.

Scan each query string once, keeping a pointer into the target word
"panthers". The pointer advances whenever the current character equals the
next letter still needed; the word is a subsequence exactly when the pointer
clears the end of the target. One pass, O(|s|) per query.
"""

import sys

TARGET = "panthers"


def is_subsequence(s: str) -> bool:
    idx = 0
    for ch in s:
        if ch == TARGET[idx]:
            idx += 1
            if idx == len(TARGET):
                return True
    return False


def main() -> None:
    data = sys.stdin.read().split()
    q = int(data[0])
    answers = ["YES" if is_subsequence(data[i]) else "NO" for i in range(1, q + 1)]
    sys.stdout.write("\n".join(answers) + "\n")


if __name__ == "__main__":
    main()
