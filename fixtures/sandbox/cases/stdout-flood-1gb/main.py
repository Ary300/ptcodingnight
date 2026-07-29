import sys
line = "A" * 1024
for _ in range(1024 * 1024):      # 1 GB
    sys.stdout.write(line)
