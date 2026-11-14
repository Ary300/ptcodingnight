"""Hall Pass Ledger -- brute-force check.

Independent approach: for every distinct name, walk the whole ledger collecting that
student's signatures, then pair them up from the front. Quadratic in the number of names,
so only for cross-checking the reference on small inputs.
"""

import sys


def main() -> None:
    tokens = sys.stdin.read().split()
    n = int(tokens[0])
    closing = int(tokens[1])
    names = tokens[2 : 2 + n]
    minutes = [int(t) for t in tokens[2 + n : 2 + 2 * n]]

    lines = []
    for name in sorted(set(names)):
        stamps = [m for who, m in zip(names, minutes) if who == name]
        if len(stamps) % 2 == 1:
            stamps.append(closing)
        total = sum(stamps[i + 1] - stamps[i] for i in range(0, len(stamps), 2))
        lines.append(f"{name} {total}")
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
