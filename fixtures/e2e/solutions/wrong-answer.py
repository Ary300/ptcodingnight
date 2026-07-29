# Deliberately wrong: subtracts instead of adding. Used to prove a WA verdict
# reaches the student, and that hidden cases leak nothing while doing so.
import sys
a, b = map(int, sys.stdin.read().split())
print(a - b)
