import socket, sys
# Try several ways out. Any success means the sandbox leaks.
targets = [("1.1.1.1", 80), ("8.8.8.8", 53), ("example.com", 80)]
for host, port in targets:
    try:
        s = socket.create_connection((host, port), timeout=3)
        s.close()
        print("ESCAPED: reached", host, port)
        sys.exit(0)
    except Exception as e:
        print("blocked:", host, type(e).__name__, file=sys.stderr)
raise SystemExit("no route out")
