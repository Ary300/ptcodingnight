"""
T4: fill the judge host's disk through the one writable bind mount.

`/out` is mounted read-write so the batch driver can return results, and the submission runs as
the same uid as the driver. `--memory`, `--pids-limit`, `--cpus` and the tmpfs cap all bound this
program; none of them bounds a write to a host directory.

The other write fixture (`write-outside-tmp`) probes /work, /etc, / and /usr/local — every path
that is READ-ONLY. It therefore proved the read-only rootfs and never touched the mount that is
genuinely writable, which is why this hole survived a passing G5.

Two attacks, because two different limits stop them:

  1. One enormous file       -> stopped by --ulimit fsize (RLIMIT_FSIZE), as EFBIG or SIGXFSZ.
  2. Many ordinary files     -> stopped by the host-side watchdog on the directory total.

Printing ESCAPED is what the suite greps for. Reaching the target without being stopped is a
breach, not a wrong verdict.
"""
import sys

TARGET_BYTES = 8 * 1024 * 1024 * 1024  # 8 GiB — more than the droplet has.
CHUNK = b"A" * (1024 * 1024)

written = 0

# --- attack 1: one enormous file -------------------------------------------
try:
    with open("/out/fill-single", "wb") as handle:
        while written < TARGET_BYTES:
            handle.write(CHUNK)
            handle.flush()
            written += len(CHUNK)
    print("ESCAPED: wrote", written, "bytes to a single file in /out")
    sys.exit(0)
except OSError as e:
    print("single-file write stopped after", written, "bytes:", type(e).__name__, file=sys.stderr)
except Exception as e:  # SIGXFSZ may surface as something else depending on runtime
    print("single-file write stopped after", written, "bytes:", type(e).__name__, file=sys.stderr)

# --- attack 2: many ordinary files -----------------------------------------
# RLIMIT_FSIZE bounds one file, not their sum. Without the directory watchdog this walks past
# the per-file cap in as many steps as it likes.
total = 0
try:
    for i in range(100000):
        with open(f"/out/fill-{i}", "wb") as handle:
            handle.write(CHUNK)
            total += len(CHUNK)
        if total >= TARGET_BYTES:
            print("ESCAPED: wrote", total, "bytes across many files in /out")
            sys.exit(0)
except OSError as e:
    print("many-file write stopped after", total, "bytes:", type(e).__name__, file=sys.stderr)
except Exception as e:
    print("many-file write stopped after", total, "bytes:", type(e).__name__, file=sys.stderr)

raise SystemExit("the judge host's disk is not reachable from a submission")
