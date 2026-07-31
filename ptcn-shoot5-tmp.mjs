import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "ptcn_session", value: process.env.TOK, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax", secure: false }]);
const page = await ctx.newPage();
await page.goto("http://localhost:3000/contest/a-very-big-sum", { waitUntil: "load" });
await page.waitForTimeout(2000);
const m = await page.evaluate(() => {
  const hs = [...document.querySelectorAll("h1,h2,h3,h4")].map(h => {
    const r = h.getBoundingClientRect();
    const sib = h.nextElementSibling;
    return { tag: h.tagName, text: h.innerText.trim().slice(0,40), y: Math.round(r.top + scrollY), next: sib ? sib.tagName + ":" + JSON.stringify((sib.innerText||"").trim().slice(0,30)) : "NONE", nextH: sib ? Math.round(sib.getBoundingClientRect().height) : null };
  });
  return hs;
});
console.log(JSON.stringify(m, null, 1));
await b.close();
