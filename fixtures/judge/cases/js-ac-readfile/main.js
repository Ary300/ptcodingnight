const data = require("node:fs").readFileSync(0, "utf8").trim().split(/\s+/);
const a = BigInt(data[0]);
const b = BigInt(data[1]);
console.log((a + b).toString());
