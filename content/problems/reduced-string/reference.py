"""Super Reduced String -- reference solution.

Single left-to-right pass with a stack: push each character unless it equals
the character on top of the stack, in which case pop instead. The stack at the
end is exactly the string with every adjacent equal pair cancelled, in O(n).
"""

import sys


def main() -> None:
    s = sys.stdin.readline().strip()

    stack: list[str] = []
    for ch in s:
        if stack and stack[-1] == ch:
            stack.pop()
        else:
            stack.append(ch)

    print("".join(stack) if stack else "Empty String")


if __name__ == "__main__":
    main()
