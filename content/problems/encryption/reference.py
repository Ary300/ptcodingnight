import sys

PAD = "x"


def encrypt(key, message):
    """Keyed columnar transposition, padded with 'x'."""
    k = len(key)

    # Column reading order: sort column indices by (letter, original index).
    order = sorted(range(k), key=lambda i: (key[i], i))

    # Pad the message so the grid is a full rectangle.
    rows = (len(message) + k - 1) // k
    padded = message + PAD * (rows * k - len(message))

    pieces = []
    for col in order:
        for row in range(rows):
            pieces.append(padded[row * k + col])
    return "".join(pieces)


def main():
    tokens = sys.stdin.read().split()
    n = int(tokens[0])
    pos = 1
    answers = []
    for _ in range(n):
        key = tokens[pos]
        message = tokens[pos + 1]
        pos += 2
        answers.append(encrypt(key, message))
    sys.stdout.write("\n".join(answers) + "\n")


main()
