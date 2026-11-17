import { expect, test, type Locator, type Page } from "@playwright/test";

import { closeTestDb, liveProblem, readSolution, seedE2EContest, testDb } from "./helpers/seed";
import { signInAsCompetitor } from "./helpers/session";

/**
 * G7, in a browser: "My submissions" is a tab IN the problem page.
 *
 * It used to be a link to the all-problems history page, and a student who clicked it had to find
 * their problem again to get back to their code. The tab shows this problem's submissions only,
 * switches without a navigation, keeps the editor's draft and caret, survives a refresh through
 * `?tab=submissions`, and works from the keyboard. The last case needs the worker: a verdict that
 * lands while the tab is open appears without a reload.
 */

const CODE = "E2E-PROBLEM-TABS";

test.describe.configure({ mode: "serial" });

let contestId = "";
let slug = "";
let liveSlotId = "";
let otherSlotId = "";
let otherTitle = "";

test.beforeAll(async () => {
  const seeded = await seedE2EContest({ now: new Date() });
  const problem = liveProblem(seeded);
  slug = problem.slug;
  const db = testDb();
  await db.contest.deleteMany({ where: { joinCode: CODE } });

  const other = await db.problem.findFirst({
    where: { state: "PUBLISHED", NOT: { id: problem.problemId } },
    select: { id: true, title: true },
    orderBy: { slug: "asc" },
  });
  expect(other, "no second published problem: run scripts/import-bank.ts").not.toBeNull();
  otherTitle = other?.title ?? "";

  const contest = await db.contest.create({
    data: {
      name: "E2E Problem Tabs",
      joinCode: CODE,
      state: "RUNNING",
      startsAt: new Date(Date.now() - 10 * 60_000),
      endsAt: new Date(Date.now() + 60 * 60_000),
    },
    select: { id: true },
  });
  contestId = contest.id;
  const slotFor = async (problemId: string, slotLabel: string) =>
    (
      await db.contestProblem.create({
        data: { contestId, problemId, slotLabel, basePoints: 100, round: "GROUP" },
        select: { id: true },
      })
    ).id;
  liveSlotId = await slotFor(problem.problemId, "G1");
  otherSlotId = await slotFor(other?.id ?? "", "G2");
});

test.afterAll(async () => {
  await testDb().contest.deleteMany({ where: { joinCode: CODE } });
  await closeTestDb();
});

/** Two submissions on this problem, one of them overridden, and one on the other problem. */
async function seedHistory(participantId: string): Promise<void> {
  const db = testDb();
  const at = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000);
  await db.submission.createMany({
    data: [
      {
        participantId,
        contestProblemId: liveSlotId,
        language: "PYTHON_312",
        sourceCode: "print(1)\n",
        submittedAt: at(300),
        verdict: "WA",
        score: 0,
        judgedAt: at(290),
        effectiveAt: at(290),
      },
      {
        // Judged WA and then set to AC by an organizer: `effectiveAt` after `judgedAt`.
        participantId,
        contestProblemId: liveSlotId,
        language: "JAVA_21",
        sourceCode: "class Main {}\n",
        submittedAt: at(200),
        verdict: "AC",
        score: 100,
        judgedAt: at(190),
        effectiveAt: at(100),
      },
      {
        participantId,
        contestProblemId: otherSlotId,
        language: "PYTHON_312",
        sourceCode: "print(2)\n",
        submittedAt: at(150),
        verdict: "AC",
        score: 100,
        judgedAt: at(140),
        effectiveAt: at(140),
      },
    ],
  });
}

function editor(page: Page): Locator {
  return page.getByRole("textbox", { name: /^Solution for / });
}

function tab(page: Page, name: "Problem" | "My submissions"): Locator {
  return page.getByRole("tablist", { name: "Problem views" }).getByRole("tab", { name, exact: true });
}

/** The visible row toggles: the table's on a wide screen, the cards' on a phone. */
function rowToggles(panel: Locator): Locator {
  return panel.getByRole("button", { name: /\d{1,2}:\d{2}:\d{2}\s?[AP]M/ });
}

async function chooseLayout(page: Page, layout: "Stacked" | "Side by side"): Promise<void> {
  const group = page.getByRole("group", { name: "Layout" });
  if ((await group.count()) === 0) return;
  await group.getByRole("button", { name: layout, exact: true }).click();
  await expect(group.getByRole("button", { name: layout, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

for (const layout of ["Stacked", "Side by side"] as const) {
  test(`${layout}: the tab lists only this problem, keeps the editor, and survives a refresh`, async ({
    page,
  }) => {
    // Two layouts of switching, typing and a reload against a dev server that compiles on first use.
    test.setTimeout(120_000);
    const viewport = page.viewportSize();
    test.skip(
      layout === "Side by side" && (viewport?.width ?? 0) < 1024,
      "side by side is only offered from 1024px",
    );

    const me = await signInAsCompetitor(page, contestId);
    await seedHistory(me.participantId);

    await page.goto(`/contest/${slug}`);
    await expect(editor(page)).toBeVisible({ timeout: 30_000 });
    await chooseLayout(page, layout);

    // A draft with the caret in the middle of it, and a mark on the node and on the window.
    const textarea = editor(page);
    await textarea.click();
    await textarea.fill("");
    await page.keyboard.type("answer = 42");
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowLeft");
    const draft = await textarea.inputValue();
    const caret = await textarea.evaluate((node) => (node as HTMLTextAreaElement).selectionStart);
    expect(caret).toBe(draft.length - 3);
    await textarea.evaluate((node) => node.setAttribute("data-probe", "same-node"));
    await page.evaluate(() => {
      (window as unknown as { tabProbe: string }).tabProbe = "no-navigation";
    });

    // --- the tab, by pointer --------------------------------------------------------------------
    await tab(page, "My submissions").click();
    await expect(tab(page, "My submissions")).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/[?&]tab=submissions(&|$)/);
    const panel = page.getByRole("tabpanel", { name: "My submissions" });
    await expect(panel).toBeVisible();
    await expect(rowToggles(panel)).toHaveCount(2, { timeout: 30_000 });
    await expect(panel.getByText(otherTitle)).toHaveCount(0);
    await expect(panel.getByText("Overridden", { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(panel.getByText("Accepted", { exact: true }).filter({ visible: true })).toHaveCount(
      1,
    );
    await expect(panel.getByText("Wrong answer", { exact: true }).filter({ visible: true })).toHaveCount(
      1,
    );
    // The statement is hidden, the editor is not.
    await expect(page.getByRole("tabpanel", { name: "Problem" })).toBeHidden();
    await expect(textarea).toBeVisible();

    // A row opens in place, as on the all-problems page.
    const first = rowToggles(panel).first();
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await expect(panel.getByText("no tests reported").filter({ visible: true })).toBeVisible();

    // No navigation happened: the window's own state survived the switch.
    expect(
      await page.evaluate(() => (window as unknown as { tabProbe?: string }).tabProbe),
    ).toBe("no-navigation");

    // --- back by keyboard -----------------------------------------------------------------------
    await tab(page, "My submissions").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(tab(page, "Problem")).toBeFocused();
    await expect(tab(page, "Problem")).toHaveAttribute("aria-selected", "true");
    await expect(page).not.toHaveURL(/tab=submissions/);
    await expect(page.getByRole("tabpanel", { name: "Problem" })).toBeVisible();

    // The editor is the same node with the same text and the same caret.
    await expect(textarea).toHaveAttribute("data-probe", "same-node");
    await expect(textarea).toHaveValue(draft);
    expect(await textarea.evaluate((node) => (node as HTMLTextAreaElement).selectionStart)).toBe(
      caret,
    );

    // Arrows wrap, and End and Home jump.
    await page.keyboard.press("ArrowLeft");
    await expect(tab(page, "My submissions")).toBeFocused();
    await expect(tab(page, "My submissions")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(tab(page, "Problem")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("End");
    await expect(tab(page, "My submissions")).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/[?&]tab=submissions(&|$)/);

    // --- a refresh keeps the tab ----------------------------------------------------------------
    await page.reload();
    await expect(tab(page, "My submissions")).toHaveAttribute("aria-selected", "true", {
      timeout: 30_000,
    });
    await expect(rowToggles(page.getByRole("tabpanel", { name: "My submissions" }))).toHaveCount(2, {
      timeout: 30_000,
    });
  });
}

test("a verdict that lands while the tab is open appears without a reload (requires the worker)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signInAsCompetitor(page, contestId);

  await page.goto(`/contest/${slug}?tab=submissions`);
  const panel = page.getByRole("tabpanel", { name: "My submissions" });
  await expect(panel.getByText("You have not submitted this problem yet.", { exact: false })).toBeVisible({
    timeout: 30_000,
  });

  await page
    .getByRole("tablist", { name: "Language" })
    .getByRole("tab", { name: /Python/ })
    .click();
  await editor(page).fill(readSolution("accepted.py"));
  await page.getByRole("button", { name: "Submit for judging" }).click();

  await expect(rowToggles(panel)).toHaveCount(1, { timeout: 30_000 });
  await expect(panel.getByText("Accepted", { exact: true }).filter({ visible: true })).toBeVisible({
    timeout: 180_000,
  });
  // Still on the tab: nothing navigated to show it.
  await expect(tab(page, "My submissions")).toHaveAttribute("aria-selected", "true");
});
