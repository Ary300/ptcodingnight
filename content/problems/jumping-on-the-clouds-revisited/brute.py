"""Jumping on the Clouds: Revisited -- brute / definition-literal solution.

Transcribes the statement as directly as possible: stand on cloud 0, and in
a while loop jump forward k clouds at a time, paying 1 per jump and 2 extra
on every thundercloud landing, stopping the first time a landing is cloud 0.
No closed form for the number of jumps, no gcd; the loop itself decides when
to stop. The task is O(number of jumps) by definition, so this is the same
complexity as the reference, just a different mechanism.
"""

import sys


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    k = int(data[1])
    clouds = [int(x) for x in data[2:2 + n]]

    energy = 100
    position = 0
    while True:
        position = (position + k) % n
        energy -= 1
        if clouds[position] == 1:
            energy -= 2
        if position == 0:
            break

    print(energy)


if __name__ == "__main__":
    main()
