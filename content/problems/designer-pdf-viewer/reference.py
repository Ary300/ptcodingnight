"""Designer PDF Viewer -- reference solution.

Read 26 letter heights, then q words. For each word the highlight rectangle is
one letter-width per character, and as tall as the tallest letter in the word,
so the area is len(word) * max(height of its letters).
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    pos = 0

    heights = []
    for _ in range(26):
        heights.append(int(data[pos]))
        pos += 1

    q = int(data[pos])
    pos += 1

    results = []
    for _ in range(q):
        word = data[pos]
        pos += 1

        tallest = 0
        for ch in word:
            letter_height = heights[ord(ch) - ord("a")]
            if letter_height > tallest:
                tallest = letter_height

        results.append(len(word) * tallest)

    sys.stdout.write("\n".join(str(area) for area in results) + "\n")


if __name__ == "__main__":
    main()
