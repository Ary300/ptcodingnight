"""Bigger is Greater -- reference solution.

For each word, compute the next permutation in lexicographic order using the
standard in-place algorithm: find the rightmost position i whose letter is
smaller than the letter after it, swap it with the smallest strictly larger
letter to its right, then reverse the (non-increasing) suffix. If no such
position exists the word is the greatest arrangement of its letters and the
answer is "no answer". O(|w|) per word.
"""

import sys


def next_permutation(word: str) -> str | None:
    s = list(word)
    i = len(s) - 2
    while i >= 0 and s[i] >= s[i + 1]:
        i -= 1
    if i < 0:
        return None
    j = len(s) - 1
    while s[j] <= s[i]:
        j -= 1
    s[i], s[j] = s[j], s[i]
    s[i + 1:] = reversed(s[i + 1:])
    return "".join(s)


def main() -> None:
    data = sys.stdin.read().split()
    t = int(data[0])
    out = []
    for k in range(1, t + 1):
        result = next_permutation(data[k])
        out.append(result if result is not None else "no answer")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
