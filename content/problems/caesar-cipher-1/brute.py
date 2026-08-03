"""Caesar Cipher -- definition-literal implementation.

The statement defines the rotation as repeatedly taking the next letter in the
alphabet, wrapping z -> a and Z -> A, and says rotating by k equals rotating by
k mod 26. So this walks each letter forward one successor at a time, (k mod 26)
times, using an explicit successor mapping instead of arithmetic on character
codes. Same asymptotic complexity as the reference (the task is O(n) by nature),
but a genuinely different mechanism: any off-by-one in the reference's slicing
or modular arithmetic would disagree with this stepper.
"""

import string
import sys


def build_successor() -> dict[str, str]:
    succ: dict[str, str] = {}
    for alphabet in (string.ascii_lowercase, string.ascii_uppercase):
        for i, ch in enumerate(alphabet):
            succ[ch] = alphabet[(i + 1) % len(alphabet)]
    return succ


def main() -> None:
    lines = sys.stdin.read().splitlines()
    n = int(lines[0])
    s = lines[1]
    k = int(lines[2])
    assert len(s) == n

    steps = k % 26
    succ = build_successor()
    out: list[str] = []
    for ch in s:
        if ch in succ:
            for _ in range(steps):
                ch = succ[ch]
        out.append(ch)
    sys.stdout.write("".join(out) + "\n")


if __name__ == "__main__":
    main()
