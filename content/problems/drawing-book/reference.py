"""Reference solution for "Drawing Book".

Spread k (0-indexed) holds pages 2k and 2k+1.  The page p therefore lives on
spread p // 2.  The last spread is spread n // 2.  Flipping forward from the
front cover to spread s costs s flips; flipping backward from the back cover
costs (n // 2) - s flips.  Take the cheaper of the two.
"""

import sys


def flips_to_page(total_pages: int, page: int) -> int:
    spread_of_page = page // 2
    last_spread = total_pages // 2
    from_front = spread_of_page
    from_back = last_spread - spread_of_page
    return min(from_front, from_back)


def main() -> None:
    data = sys.stdin.read().split()
    total_pages = int(data[0])
    query_count = int(data[1])

    answers = []
    for i in range(query_count):
        page = int(data[2 + i])
        answers.append(flips_to_page(total_pages, page))

    sys.stdout.write("\n".join(str(a) for a in answers) + "\n")


if __name__ == "__main__":
    main()
