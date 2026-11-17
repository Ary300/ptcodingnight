import { afterEach, describe, expect, it, vi } from "vitest";

import { caretKey, clampFontSize, parseCaretMemory, readCaret, readFontSize, writeCaret, writeFontSize } from "@/components/contest/editor/commands/editor-memory";
import { docParts, signatureParts } from "@/components/contest/editor/commands/InfoPopup";
import { expectedText, landed } from "@/components/contest/editor/native-edit";
import type { Edit } from "@/components/contest/editor/smart/types";

/**
 * The pure halves of the commands the smart modules do not own: the info panel's text split, the
 * remembered caret and font size, and the insertText check. Surround With, Parameter Info, Quick
 * Documentation, paste cleanup and Show Context Actions are the engine's and completion's pure
 * functions, tested in editor-engine-paste-surround.test.ts and editor-completion-extras.test.ts.
 */

describe("signatureParts", () => {
  it("splits a signature into its parameters for bolding", () => {
    expect(signatureParts("max(int a, int b)")).toEqual({ head: "max(", params: ["int a", "int b"], tail: ")" });
  });
});

describe("docParts", () => {
  it("splits a Quick Documentation note into the signature and its sentence", () => {
    expect(docParts("int length. The number of elements; a field, so no parentheses.")).toEqual({
      title: "int length",
      body: "The number of elements; a field, so no parentheses.",
    });
  });

  it("keeps a note with no sentence as the title alone", () => {
    expect(docParts("ArrayList<E>")).toEqual({ title: "ArrayList<E>", body: "" });
  });
});

describe("insertText fallback", () => {
  it("knows when execCommand reported success and changed nothing", () => {
    const edit: Edit = { from: 0, to: 0, insert: "x", selectionStart: 1, selectionEnd: 1 };
    expect(expectedText("ab", edit)).toBe("xab");
    expect(landed("xab", "ab", edit)).toBe(true);
    expect(landed("ab", "ab", edit)).toBe(false);
  });
});

describe("editor memory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubStorage(): Map<string, string> {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
    });
    return store;
  }

  it("keys the caret by page and language", () => {
    expect(caretKey("/contest/two-sum", "JAVA_21")).not.toBe(caretKey("/contest/two-sum", "PYTHON_312"));
  });

  it("round-trips a caret and rejects anything malformed", () => {
    stubStorage();
    writeCaret("k", { selectionStart: 3, selectionEnd: 5, scrollTop: 40, scrollLeft: 0 });
    expect(readCaret("k")).toEqual({ selectionStart: 3, selectionEnd: 5, scrollTop: 40, scrollLeft: 0 });
    expect(parseCaretMemory("{")).toBeNull();
    expect(parseCaretMemory(JSON.stringify({ selectionStart: -1, selectionEnd: 0, scrollTop: 0, scrollLeft: 0 }))).toBeNull();
    expect(parseCaretMemory(JSON.stringify({ selectionStart: 5, selectionEnd: 2, scrollTop: 0, scrollLeft: 0 }))).toBeNull();
  });

  it("bounds the font size to 12 through 22 px", () => {
    stubStorage();
    expect(clampFontSize(40)).toBe(22);
    expect(clampFontSize(3)).toBe(12);
    writeFontSize(30);
    expect(readFontSize()).toBe(22);
  });

  it("works with blocked storage", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readCaret("k")).toBeNull();
    expect(readFontSize()).toBeNull();
    expect(() => writeCaret("k", { selectionStart: 0, selectionEnd: 0, scrollTop: 0, scrollLeft: 0 })).not.toThrow();
  });
});
