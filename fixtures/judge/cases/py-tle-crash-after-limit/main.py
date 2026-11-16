# Runs past its TLE threshold (6 s) and THEN crashes. Under the old rule it was killed only at
# 10 s, so the crash at 7.5 s reported RE. A test past its threshold is TLE whatever ends it, and
# it is killed at the threshold, so this is TLE. 0 points either way.
import sys
import time

sys.stdin.read()
start = time.monotonic()
while time.monotonic() - start < 7.5:
    pass
raise RuntimeError("too late to matter")
