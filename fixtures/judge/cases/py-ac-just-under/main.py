# Finishes 1.5 s under the TLE threshold (2 s x 1 + 4 s startup budget = 6 s), with the right
# answer. A test killed at its threshold must not reach this one: AC under either TLE rule.
import sys
import time

a, b = map(int, sys.stdin.read().split())
time.sleep(4.5)
print(a + b)
