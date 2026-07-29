CHUNK = 64 * 1024 * 1024
held = []
target = 10 * 1024 * 1024 * 1024
while sum(len(b) for b in held) < target:
    block = bytearray(CHUNK)
    block[::4096] = b"\xff" * (CHUNK // 4096)   # commit the pages
    held.append(block)
print("ESCAPED: allocated 10GB")
