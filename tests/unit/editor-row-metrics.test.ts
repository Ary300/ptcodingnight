import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OverlayContent } from "@/components/contest/editor/decorations/OverlayContent";
import { LINE_HEIGHT_RATIO, rowPitchPx, rowsLength } from "@/components/contest/editor/decorations/row-metrics";

const TOKEN_CLASS = {
  plain: "",
  keyword: "",
  type: "",
  string: "",
  number: "",
  comment: "",
  punctuation: "",
} as const;

describe("rowPitchPx", () => {
  it("is a whole number of pixels at every size the editor's font keys reach", () => {
    for (let size = 8; size <= 40; size += 1) {
      const pitch = rowPitchPx(size);
      expect(Number.isInteger(pitch)).toBe(true);
      expect(Math.abs(pitch - size * LINE_HEIGHT_RATIO)).toBeLessThanOrEqual(0.5);
    }
  });

  it("gives 21px at the default 16px, where the fractional 20.8px used to drift", () => {
    expect(rowPitchPx(16)).toBe(21);
  });

  it("falls back to the default pitch for a size it cannot use", () => {
    expect(rowPitchPx(Number.NaN)).toBe(21);
    expect(rowPitchPx(0)).toBe(21);
  });
});

describe("rowsLength", () => {
  it("is whole pixels once the pitch is known, and the ratio in em before", () => {
    expect(rowsLength(16, 21)).toBe("336px");
    expect(rowsLength(1, null)).toBe("1.3em");
  });
});

describe("OverlayContent's caret row", () => {
  it("sits at padding plus (line - 1) whole rows, one row tall", () => {
    const html = renderToStaticMarkup(
      createElement(OverlayContent, { segments: [], tokenClass: TOKEN_CLASS, guides: [], caretLine: 17, rowPx: 21 }),
    );
    expect(html).toContain('data-caret-row="17"');
    expect(html).toContain("top:calc(0.75rem + 336px)");
    expect(html).toContain("height:21px");
  });

  it("puts indent guides on the same grid", () => {
    const html = renderToStaticMarkup(
      createElement(OverlayContent, {
        segments: [],
        tokenClass: TOKEN_CLASS,
        guides: [{ column: 4, fromLine: 3, toLine: 5 }],
        caretLine: null,
        rowPx: 25,
      }),
    );
    expect(html).toContain("top:calc(0.75rem + 50px)");
    expect(html).toContain("height:75px");
  });
});
