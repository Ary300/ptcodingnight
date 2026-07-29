import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import type { Result } from "axe-core";

/**
 * The axe pass, shared by every a11y spec.
 *
 * G9's bar is **zero critical or serious** violations (PRD §12). Moderate and minor findings are
 * still printed, because a list nobody sees is a list nobody fixes — but they do not fail the
 * gate, and the threshold is not moved in either direction from a spec file.
 */

const BLOCKING = new Set(["critical", "serious"]);

/** WCAG 2.1 AA, which is what DESIGN.md §7 commits to. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

function describe(violation: Result): string {
  const targets = violation.nodes
    .slice(0, 4)
    .map((node) => node.target.join(" "))
    .join("\n      ");
  return [
    `  [${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help}`,
    `      ${violation.helpUrl}`,
    `      ${targets}`,
  ].join("\n");
}

export interface AuditOptions {
  /**
   * CSS selectors to exclude, each with the reason. Empty by default and expected to stay that
   * way: an exclusion is a hole in the gate, so it has to be argued for in the call site.
   */
  readonly exclude?: readonly { selector: string; because: string }[];
}

export async function auditPage(
  page: Page,
  label: string,
  options: AuditOptions = {},
): Promise<Result[]> {
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  for (const exclusion of options.exclude ?? []) {
    builder = builder.exclude(exclusion.selector);
  }

  const results = await builder.analyze();
  const blocking = results.violations.filter((violation) =>
    BLOCKING.has(violation.impact ?? "minor"),
  );
  const advisory = results.violations.filter(
    (violation) => !BLOCKING.has(violation.impact ?? "minor"),
  );

  if (advisory.length > 0) {
    console.log(
      `${label}: ${advisory.length} non-blocking axe finding(s)\n${advisory.map(describe).join("\n")}`,
    );
  }

  expect(
    blocking,
    `${label} has ${blocking.length} critical/serious axe violation(s):\n${blocking.map(describe).join("\n")}`,
  ).toEqual([]);

  return results.violations;
}
