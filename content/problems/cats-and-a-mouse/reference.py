"""Reference solution for "Cats and a Mouse".

Both cats move at the same speed, so the winner is simply the cat whose starting
mark is closer to the mouse's mark. Equal distances mean the mouse gets away.
"""

import sys


def winner(pixel: int, byte: int, mouse: int) -> str:
    pixel_distance = abs(pixel - mouse)
    byte_distance = abs(byte - mouse)
    if pixel_distance < byte_distance:
        return "PIXEL"
    if byte_distance < pixel_distance:
        return "BYTE"
    return "SAFE"


def main() -> None:
    data = sys.stdin.read().split()
    q = int(data[0])
    results = []
    index = 1
    for _ in range(q):
        pixel = int(data[index])
        byte = int(data[index + 1])
        mouse = int(data[index + 2])
        index += 3
        results.append(winner(pixel, byte, mouse))
    sys.stdout.write("\n".join(results) + "\n")


if __name__ == "__main__":
    main()
