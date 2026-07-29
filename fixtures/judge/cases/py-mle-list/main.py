# Commits pages as it goes rather than relying on lazily-zeroed allocations, so the
# container's memory cap is hit in well under a second instead of racing the wall clock.
CHUNK = 32 * 1024 * 1024
held = []
while True:
    block = bytearray(CHUNK)
    block[::4096] = b"\xff" * (CHUNK // 4096)  # touch every page
    held.append(block)
