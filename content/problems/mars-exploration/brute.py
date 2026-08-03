"""Mars Exploration -- definition-literal implementation.

Materialise the exact string the rover transmitted ("SOS" repeated enough
times to match the received length), then walk the two strings in parallel
and count disagreements. Same O(n) complexity as the reference; this task
has no natural slow variant, so this is the most literal reading of the
statement rather than an asymptotically different algorithm.
"""

import sys


def main() -> None:
    received = sys.stdin.readline().strip()
    original = "SOS" * (len(received) // 3)
    altered = 0
    for sent_ch, got_ch in zip(original, received):
        if sent_ch != got_ch:
            altered += 1
    print(altered)


if __name__ == "__main__":
    main()
