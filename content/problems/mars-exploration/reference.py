"""Mars Exploration -- reference solution.

The original message is "SOS" repeated, so position i should hold
"SOS"[i % 3]. Count the positions in the received message that disagree.
"""

import sys

PATTERN = "SOS"


def main() -> None:
    message = sys.stdin.readline().strip()
    altered = sum(1 for i, ch in enumerate(message) if ch != PATTERN[i % 3])
    print(altered)


if __name__ == "__main__":
    main()
