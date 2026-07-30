// The classic JavaScript mistake: string concatenation instead of addition. "2 3" -> "23".
const data = require("node:fs").readFileSync(0, "utf8").trim().split(/\s+/);
console.log(data[0] + data[1]);
