import os, sys
spawned = 0
try:
    while True:
        pid = os.fork()
        spawned += 1
        if pid == 0:
            # child forks too
            continue
except OSError as e:
    print("fork refused after", spawned, "spawns:", e, file=sys.stderr)
    sys.exit(1)
