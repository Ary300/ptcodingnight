// Uncaught throw exits non-zero — RE. --check passes, so this is not a CE.
require("node:fs").readFileSync(0, "utf8");
throw new Error("deliberate");
