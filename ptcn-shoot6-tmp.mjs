import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "ptcn_session", value: process.env.TOK, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax", secure: false }]);
const page = await ctx.newPage();
await page.goto("http://localhost:3000/contest/a-very-big-sum", { waitUntil: "load" });
await page.waitForTimeout(3000);
const m = await page.evaluate(() => {
  const all = [...document.querySelectorAll("h2")].map(h => ({ text: h.textContent, y: Math.round(h.getBoundingClientRect().top + scrollY), nextTag: h.nextElementSibling?.tagName ?? null, nextH: h.nextElementSibling ? Math.round(h.nextElementSibling.getBoundingClientRect().height) : null, nextText: (h.nextElementSibling?.textContent ?? "").slice(0,30) }));
  return all;
});
console.log(JSON.stringify(m, null, 1));
await page.screenshot({ path: process.env.OUT + "/problem-statement-empty-sections.png", clip: { x: 100, y: 1520, width: 900, height: 260 } });
await b.close();
