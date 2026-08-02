"""Time Conversion -- brute-force solution.

Different approach from the reference on purpose: enumerate every one of the
86400 seconds in a day, render each as a 12-hour clock string, and when one
matches the input, print that second in 24-hour form. Obviously correct
because the mapping is built from the definition of both clocks, one second
at a time.
"""

import sys


def to_12h(total_seconds: int) -> str:
    hour24 = total_seconds // 3600
    minute = (total_seconds % 3600) // 60
    second = total_seconds % 60

    suffix = "AM" if hour24 < 12 else "PM"
    hour12 = hour24 % 12
    if hour12 == 0:
        hour12 = 12
    return f"{hour12:02d}:{minute:02d}:{second:02d}{suffix}"


def to_24h(total_seconds: int) -> str:
    hour24 = total_seconds // 3600
    minute = (total_seconds % 3600) // 60
    second = total_seconds % 60
    return f"{hour24:02d}:{minute:02d}:{second:02d}"


def main() -> None:
    target = sys.stdin.read().strip()
    for tick in range(24 * 60 * 60):
        if to_12h(tick) == target:
            print(to_24h(tick))
            return
    raise ValueError(f"no second of the day renders as {target!r}")


if __name__ == "__main__":
    main()
