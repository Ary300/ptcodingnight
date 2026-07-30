"""
T4, second form: fill the judge host's disk through a SUBDIRECTORY of /out.

Its own fixture rather than a third attack appended to `disk-fill-out`, because that one is
killed by the watchdog partway through its second attack — so a subdirectory attack bolted on the
end never executes, and the case would pass whether or not the hole was fixed. A regression test
that cannot fail is not a regression test.

The hole: the host-side watchdog reads /out one level deep and sums `isFile()` entries. A single
subdirectory is therefore ONE entry, under the file-count limit, contributing ZERO bytes to the
byte budget — no matter how much is written beneath it. Both halves of the T4 fix are defeated at
once, and `--ulimit fsize` only ever capped an individual file.

Contained now by refusing outright when any directory appears in /out: the batch driver writes a
flat set of files and never creates one, so a directory there is hostile by definition. Recursing
instead would put the poll's cost back under the submission's control, which is the starvation
that made the first version of this watchdog useless.
"""
import os
import sys

TARGET_BYTES = 8 * 1024 * 1024 * 1024  # 8 GiB — more than the droplet has.
CHUNK = b"A" * (1024 * 1024)

total = 0
try:
    os.mkdir("/out/hidden")
except OSError as e:
    print("could not create /out/hidden:", type(e).__name__, file=sys.stderr)
    raise SystemExit("no writable subdirectory in /out")

try:
    for i in range(100000):
        with open(f"/out/hidden/{i}", "wb") as handle:
            handle.write(CHUNK)
        total += len(CHUNK)
        if total >= TARGET_BYTES:
            print("ESCAPED: wrote", total, "bytes below a subdirectory in /out")
            sys.exit(0)
except OSError as e:
    print("stopped after", total, "bytes:", type(e).__name__, file=sys.stderr)
except Exception as e:
    print("stopped after", total, "bytes:", type(e).__name__, file=sys.stderr)

raise SystemExit("the judge host's disk is not reachable through a subdirectory either")
