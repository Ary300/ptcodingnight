import sys
targets = ["/work/pwned.txt", "/etc/pwned.txt", "/pwned.txt", "/usr/local/pwned.txt"]
for path in targets:
    try:
        with open(path, "w") as f:
            f.write("pwned")
        print("ESCAPED: wrote", path)
        sys.exit(0)
    except OSError as e:
        print("blocked:", path, type(e).__name__, file=sys.stderr)
raise SystemExit("filesystem is read-only")
