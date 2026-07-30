const fs = require("node:fs");
try {
  fs.writeFileSync("/etc/ptcn-owned", "x");
  console.log("WROTE");
} catch (e) {
  console.error("write failed:", e.message);
  process.exit(1);
}
