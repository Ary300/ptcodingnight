"""Time Conversion -- reference solution.

Read one 12-hour clock time (hh:mm:ssAM or hh:mm:ssPM) and print the same time
of day on a 24-hour clock. The two special cases are hour 12: 12:xx:xxAM maps
to hour 00 and 12:xx:xxPM stays at hour 12.
"""

import sys


def main() -> None:
    raw = sys.stdin.read().strip()
    suffix = raw[8:10]
    hour = int(raw[0:2])
    rest = raw[2:8]  # ":mm:ss"

    if suffix == "AM":
        hour24 = 0 if hour == 12 else hour
    else:
        hour24 = 12 if hour == 12 else hour + 12

    print(f"{hour24:02d}{rest}")


if __name__ == "__main__":
    main()
