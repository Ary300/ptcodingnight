import sys


def flipped(n: int) -> int:
    """The ticket number with its digits written backwards, leading zeros dropped."""
    return int(str(n)[::-1])


def main() -> None:
    data = sys.stdin.read().split()
    a = int(data[0])
    b = int(data[1])
    k = int(data[2])

    count = 0
    for ticket in range(a, b + 1):
        if (ticket - flipped(ticket)) % k == 0:
            count += 1

    print(count)


if __name__ == "__main__":
    main()
