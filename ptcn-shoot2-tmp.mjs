import { chromium } from "@playwright/test";
const OUT = process.env.OUT;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "ptcn_session", value: process.env.TOK, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax", secure: false }]);
const page = await ctx.newPage();
await page.goto("http://localhost:3000/contest/a-very-big-sum", { waitUntil: "load" });
await page.waitForTimeout(2000);
const ta = page.locator("textarea");
await ta.click();
await page.keyboard.press("ControlOrMeta+a");
await ta.fill("import sys\ndata = sys.stdin.read().split()\nprint(sum(int(x) for x in data[1:]))  # this is a deliberately very long comment line that will exceed the width of the editor box to see what happens with wrapping\nprint('done')\n");
await page.waitForTimeout(600);
const panel = page.locator('section[aria-label="Your solution"]');
await panel.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await panel.screenshot({ path: `${OUT}/editor-longline-1440.png` });
// measure gutter vs textarea alignment
const m = await page.evaluate(() => {
  const ta = document.querySelector('section[aria-label="Your solution"] textarea');
  const g = ta.parentElement.querySelector('div[aria-hidden="true"]');
  return { taScrollW: ta.scrollWidth, taClientW: ta.clientWidth, taScrollH: ta.scrollHeight, gutterH: g.scrollHeight, gutterLines: g.children.length, wrap: ta.wrap, taStyleWhiteSpace: getComputedStyle(ta).whiteSpace, overflowX: getComputedStyle(ta).overflowX };
});
console.log(JSON.stringify(m, null, 1));
// caret readout
const caret = await page.locator('section[aria-label="Your solution"] p[aria-hidden="true"]').innerText();
console.log("caret readout:", caret);
await b.close();
