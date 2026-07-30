// Node's net module, same containment question as Python's socket.
const net = require("node:net");
const s = net.connect(80, "1.1.1.1");
s.on("connect", () => { console.log("CONNECTED"); process.exit(0); });
s.on("error", (e) => { console.error("dial failed:", e.message); process.exit(1); });
