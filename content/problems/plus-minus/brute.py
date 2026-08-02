"""Plus Minus -- brute-force check.

Obviously correct alternative: build the three sub-lists explicitly with
filters and take their lengths. No attention paid to memory or speed.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    values = [int(x) for x in data[1:1 + n]]

    positives = [v for v in values if v > 0]
    negatives = [v for v in values if v < 0]
    zeros = [v for v in values if v == 0]
    assert len(positives) + len(negatives) + len(zeros) == n

    print(f"{len(positives) / n:.6f}")
    print(f"{len(negatives) / n:.6f}")
    print(f"{len(zeros) / n:.6f}")


if __name__ == "__main__":
    main()
