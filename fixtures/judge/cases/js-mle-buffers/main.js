// Buffer.alloc zero-fills, so every page is really touched and the kernel really OOM-kills.
// Buffer.allocUnsafe would reserve without faulting pages in and report TLE instead.
const held = [];
for (;;) {
  held.push(Buffer.alloc(64 * 1024 * 1024, 1));
  process.stderr.write(".");
}
