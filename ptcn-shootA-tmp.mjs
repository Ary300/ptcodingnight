import { chromium } from "@playwright/test";
const OUT = process.env.OUT;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "ptcn_session", value: process.env.TOK, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax", secure: false }]);
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
page.on("console", m => { if (m.type()==="error") errs.push(m.text()); });

async function run(w, h, tag) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("http://localhost:3000/contest/a-very-big-sum", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const ta = page.locator("textarea");
  await ta.click();
  await ta.fill("");
  // real typing so caret sync fires
  await page.keyboard.type("import sys\ndef main():\nd = sys.stdin.read().split()  # a deliberately long trailing comment that runs well past the right edge of the editor box\nprint(sum(int(x) for x in d[1:]))\n");
  await page.waitForTimeout(500);
  const panel = page.locator('section[aria-label="Your solution"]');
  await panel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await panel.screenshot({ path: `${OUT}/editor-${tag}.png` });
  const m = await page.evaluate(() => {
    const ta = document.querySelector('section[aria-label="Your solution"] textarea');
    const wrapDiv = ta.closest("div.relative");
    const pre = wrapDiv.querySelector("pre");
    const gut = wrapDiv.parentElement.querySelector('div[aria-hidden="true"]');
    const cs = (e) => { const s = getComputedStyle(e); return { ff: s.fontFamily.slice(0,30), fs: s.fontSize, lh: s.lineHeight, pad: s.padding, ls: s.letterSpacing, ts: s.tabSize, ws: s.whiteSpace, fw: s.fontWeight }; };
    return { ta: cs(ta), pre: cs(pre), gutter: cs(gut),
      taRect: ta.getBoundingClientRect().toJSON(), preRect: pre.getBoundingClientRect().toJSON(),
      taScrollW: ta.scrollWidth, taClientW: ta.clientWidth, preScrollW: pre.scrollWidth,
      gutterLines: gut.children.length, gutterTexts: [...gut.children].map(c=>c.textContent).join(","),
      docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  console.log(tag, JSON.stringify(m, null, 1));
  // scroll right and re-shot to test overlay sync
  await page.evaluate(() => { const t = document.querySelector('section[aria-label="Your solution"] textarea'); t.scrollLeft = 400; t.dispatchEvent(new Event("scroll", {bubbles:true})); });
  await page.waitForTimeout(400);
  await panel.screenshot({ path: `${OUT}/editor-${tag}-hscroll.png` });
}
await run(1440, 1000, "cur-1440");
await run(360, 780, "cur-360");
console.log("ERRORS", JSON.stringify(errs));
await b.close();
