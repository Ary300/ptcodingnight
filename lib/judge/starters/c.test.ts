import { describe, expect, it } from "vitest";

import { cParameterList, emitC, emitCProbe, type Signature } from "@/lib/judge/starters/c";

/**
 * Two of these assertions are the WHOLE emitted file, on purpose.
 *
 * A starter is the first thing forty students read, and every change to it should show up as a
 * diff a reviewer can read rather than as a surprise at 7pm. Spot-assertions on a substring
 * would let the harness drift a line at a time.
 *
 * `String.raw` because the emitted C is full of backslashes ('\0', "\n") that a normal template
 * literal would interpret. The emitter deliberately puts no backticks in its output for the
 * same reason.
 *
 * When `fixtures/starters/<slug>/main.c` lands (SPEC §6.1) these two goldens should move there
 * verbatim and this file should read them — the bytes are the same, only the home changes.
 */

/** The block every file carries unchanged: banner + the three always-emitted readers. */
const HARNESS = String.raw`/* -------------------------------------------------------------------------
 * Everything below reads the input and prints the answer.
 * You do not need to change anything below this line.
 * ------------------------------------------------------------------------- */

/*
 * next_token grows its buffer, so there is no maximum token length. A fixed char buf[N]
 * plus scanf("%s") is a buffer overflow on the first problem with a long word, and this
 * codebase already ships a 2000-character token.
 */
static char *next_token(void) {
    size_t cap = 16;
    size_t len = 0;
    char *s = (char *)malloc(cap);
    int c = getchar();
    while (c != EOF && isspace(c)) c = getchar();
    while (c != EOF && !isspace(c)) {
        if (len + 1 >= cap) { cap *= 2; s = (char *)realloc(s, cap); }
        s[len++] = (char)c;
        c = getchar();
    }
    s[len] = '\0';
    return s;
}

static int next_int(void) {
    char *t = next_token();
    int v = (int)strtol(t, NULL, 10);
    free(t);
    return v;
}

static long long next_long(void) {
    char *t = next_token();
    long long v = strtoll(t, NULL, 10);
    free(t);
    return v;
}`;

/** `cut-the-sticks` — array return, a `passed: false` count, and C's two derived parameters. */
const CUT_THE_STICKS: Signature = {
  name: "cutTheSticks",
  returns: { type: "int[]", join: "\n" },
  params: [
    { name: "n", type: "int", passed: false },
    { name: "arr", type: "int[]", length: "n" },
  ],
};

/** `encryption` — a repeat loop, two string parameters, a string return. */
const ENCRYPTION: Signature = {
  name: "encryption",
  returns: { type: "string" },
  shared: [{ name: "n", type: "int", passed: false }],
  repeat: "n",
  params: [
    { name: "key", type: "string" },
    { name: "message", type: "string" },
  ],
};

describe("emitC — the whole file", () => {
  it("emits cut-the-sticks byte for byte", () => {
    expect(emitC(CUT_THE_STICKS)).toBe(
      String.raw`#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Complete the 'cutTheSticks' function below.
 *
 * The function is expected to return an INTEGER_ARRAY.
 * The function accepts following parameter(s):
 *  1. INTEGER_ARRAY arr
 * arr_count is how many entries arr has.
 * Store how many entries you are returning in *result_count.
 */
int *cutTheSticks(int arr_count, int *arr, int *result_count) {
    /* Write your code here */
    *result_count = 0;
    return NULL;
}

` +
        HARNESS +
        String.raw`

int main(void) {
    int n = next_int();
    int *arr = (int *)malloc((size_t)(n > 0 ? n : 1) * sizeof(int));
    for (int _i = 0; _i < n; _i++) arr[_i] = next_int();

    int _result_count = 0;
    int *_result = cutTheSticks(n, arr, &_result_count);
    for (int _i = 0; _i < _result_count; _i++) {
        if (_i > 0) printf("\n");
        printf("%d", _result[_i]);
    }
    printf("\n");

    return 0;
}
`,
    );
  });

  it("emits encryption byte for byte", () => {
    expect(emitC(ENCRYPTION)).toBe(
      String.raw`#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Complete the 'encryption' function below.
 *
 * The function is expected to return a STRING.
 * The function accepts following parameter(s):
 *  1. STRING key
 *  2. STRING message
 */
const char *encryption(const char *key, const char *message) {
    /* Write your code here */
    return "";
}

` +
        HARNESS +
        String.raw`

int main(void) {
    int n = next_int();

    for (int _case = 0; _case < n; _case++) {
        const char *key = next_token();
        const char *message = next_token();

        printf("%s\n", encryption(key, message));
    }

    return 0;
}
`,
    );
  });
});

describe("the student zone", () => {
  it("marks where to write, and nothing else claims to be editable", () => {
    const source = emitC(CUT_THE_STICKS);
    expect(source.split("\n").filter((line) => line.includes("Write your code here"))).toHaveLength(
      1,
    );
    // The banner is where the harness starts. The stub must come before it, so the caret lands
    // in the first third of the file rather than below forty lines of plumbing.
    expect(source.indexOf("Write your code here")).toBeLessThan(source.indexOf("Everything below"));
  });

  it('says "do not need to", never "must not"', () => {
    // Load-bearing wording (SPEC §4): a student who needs another #include has to edit the
    // include block, which is outside the stub by any drawing of it.
    expect(emitC(ENCRYPTION)).toContain("You do not need to change anything below this line.");
  });
});

describe("the type map", () => {
  const longSum: Signature = {
    name: "aVeryBigSum",
    returns: { type: "long" },
    params: [
      { name: "n", type: "int", passed: false },
      { name: "ar", type: "long[]", length: "n" },
    ],
  };

  it("gives long its own width everywhere it appears", () => {
    const source = emitC(longSum);
    expect(source).toContain("long long aVeryBigSum(int ar_count, long long *ar) {");
    expect(source).toContain(
      "long long *ar = (long long *)malloc((size_t)(n > 0 ? n : 1) * sizeof(long long));",
    );
    expect(source).toContain("for (int _i = 0; _i < n; _i++) ar[_i] = next_long();");
    // %lld, not %d: a-very-big-sum has a real test whose answer is 10^17.
    expect(source).toContain(`printf("%lld\\n", aVeryBigSum(n, ar));`);
    expect(source).toContain(" * The function is expected to return a LONG_INTEGER.");
  });

  it("passes strings as const char * and string arrays as char **", () => {
    // char ** and NOT const char **: char ** does not implicitly convert to const char ** in C,
    // so the const version would reject the obvious student code.
    const shout: Signature = {
      name: "shoutWords",
      returns: { type: "string[]", join: " " },
      params: [
        { name: "wordCount", type: "int", passed: false },
        { name: "words", type: "string[]", length: "wordCount" },
      ],
    };
    expect(cParameterList(shout)).toBe("int words_count, char **words, int *result_count");
    expect(emitC(shout)).toContain(
      "char **words = (char **)malloc((size_t)(wordCount > 0 ? wordCount : 1) * sizeof(char *));",
    );
  });

  it("writes 'an' before INTEGER and 'a' before everything else", () => {
    expect(emitC(CUT_THE_STICKS)).toContain("expected to return an INTEGER_ARRAY.");
    expect(emitC(ENCRYPTION)).toContain("expected to return a STRING.");
  });
});

describe("lengths", () => {
  it("clamps a named length so malloc is never asked for zero", () => {
    // malloc(0) may legitimately return NULL, and a NULL array parameter is a segfault the
    // student cannot explain.
    expect(emitC(CUT_THE_STICKS)).toContain("(size_t)(n > 0 ? n : 1)");
  });

  it("emits a literal length plainly", () => {
    const pdf: Signature = {
      name: "designerPdfViewer",
      returns: { type: "int" },
      shared: [
        { name: "h", type: "int[]", length: 26 },
        { name: "q", type: "int", passed: false },
      ],
      repeat: "q",
      params: [{ name: "word", type: "string" }],
    };
    const source = emitC(pdf);
    expect(source).toContain("int *h = (int *)malloc((size_t)26 * sizeof(int));");
    expect(source).toContain("for (int _i = 0; _i < 26; _i++) h[_i] = next_int();");
    // The literal is what the derived count parameter receives.
    expect(source).toContain(`printf("%d\\n", designerPdfViewer(26, h, word));`);
  });
});

describe("collision safety", () => {
  it("does not let a field named t capture the repeat counter", () => {
    // `for (int t = 0; t < t; t++)` compiles, shadows its own bound, and runs zero times.
    // angry-professor declares a shared field named exactly `t`.
    const angry: Signature = {
      name: "angryProfessor",
      returns: { type: "string" },
      shared: [{ name: "t", type: "int", passed: false }],
      repeat: "t",
      params: [
        { name: "n", type: "int", passed: false },
        { name: "k", type: "int" },
        { name: "a", type: "int[]", length: "n" },
      ],
    };
    const source = emitC(angry);
    expect(source).toContain("for (int _case = 0; _case < t; _case++) {");
    expect(source).not.toContain("for (int t = 0;");
  });

  it("does not let a field named result capture the harness result", () => {
    const shadow: Signature = {
      name: "shadow",
      returns: { type: "int[]", join: " " },
      params: [
        { name: "result", type: "int", passed: false },
        { name: "values", type: "int[]", length: "result" },
      ],
    };
    const source = emitC(shadow);
    expect(source).toContain("int _result_count = 0;");
    expect(source).toContain("int *_result = shadow(result, values, &_result_count);");
  });
});

describe("printing the answer", () => {
  it("separates array elements with the declared join and always ends the call with a newline", () => {
    // The trailing newline is unconditional, including for an empty result: the Python harness
    // prints one line per call whatever the call returned, and G13 compares the six harnesses
    // byte for byte.
    const games: Signature = {
      name: "howManyGames",
      returns: { type: "int[]", join: " " },
      shared: [{ name: "q", type: "int", passed: false }],
      repeat: "q",
      params: [{ name: "p", type: "int" }],
    };
    expect(emitC(games)).toContain(
      [
        "        int _result_count = 0;",
        "        int *_result = howManyGames(p, &_result_count);",
        "        for (int _i = 0; _i < _result_count; _i++) {",
        `            if (_i > 0) printf(" ");`,
        `            printf("%d", _result[_i]);`,
        "        }",
        `        printf("\\n");`,
      ].join("\n"),
    );
  });

  it("escapes a newline join into a C literal", () => {
    expect(emitC(CUT_THE_STICKS)).toContain(`if (_i > 0) printf("\\n");`);
  });
});

describe("emitCProbe", () => {
  it("keeps the stub verbatim and adds only echo statements", () => {
    // The probe CONTAINS the starter's stub, which is what makes "the probe compiled" evidence
    // that "the starter compiles". The echo lines declare no locals whose removal could matter.
    const probe = emitCProbe(CUT_THE_STICKS);
    expect(probe).toContain(
      [
        "int *cutTheSticks(int arr_count, int *arr, int *result_count) {",
        "    /* Write your code here */",
        `    printf("%d:", arr_count);`,
        `    for (int _i = 0; _i < arr_count; _i++) printf(" %d", arr[_i]);`,
        `    printf("\\n");`,
        "    *result_count = 0;",
        "    return NULL;",
        "}",
      ].join("\n"),
    );
  });

  it("echoes scalars one per line, in argument order", () => {
    expect(emitCProbe(ENCRYPTION)).toContain(
      [
        "const char *encryption(const char *key, const char *message) {",
        "    /* Write your code here */",
        `    printf("%s\\n", key);`,
        `    printf("%s\\n", message);`,
        `    return "";`,
        "}",
      ].join("\n"),
    );
  });

  it("differs from the starter only inside the student zone", () => {
    const starter = emitC(CUT_THE_STICKS);
    const probe = emitCProbe(CUT_THE_STICKS);
    const harnessOf = (source: string) => source.slice(source.indexOf("/* ------"));
    expect(harnessOf(probe)).toBe(harnessOf(starter));
  });
});

describe("cParameterList", () => {
  it("injects a count before every array and an out-parameter for an array return", () => {
    expect(cParameterList(CUT_THE_STICKS)).toBe("int arr_count, int *arr, int *result_count");
  });

  it("omits fields the declaration does not pass", () => {
    expect(cParameterList(ENCRYPTION)).toBe("const char *key, const char *message");
  });

  it("writes (void) rather than an empty list", () => {
    // `f()` in C means "unspecified arguments"; only `f(void)` means none.
    const nothing: Signature = {
      name: "constant",
      returns: { type: "int" },
      params: [{ name: "n", type: "int", passed: false }],
    };
    expect(cParameterList(nothing)).toBe("void");
    expect(emitC(nothing)).toContain("int constant(void) {");
    // With no parameters the doc comment has nothing to list, so it lists nothing.
    expect(emitC(nothing)).not.toContain("accepts following parameter(s)");
  });
});

describe("refusing to emit something that cannot compile", () => {
  it("throws when an array field has no length", () => {
    expect(() =>
      emitC({
        name: "f",
        returns: { type: "int" },
        params: [{ name: "ar", type: "int[]" }],
      }),
    ).toThrow(/array field "ar" has no length/);
  });

  it("throws when an array return has no join", () => {
    expect(() =>
      emitC({
        name: "f",
        returns: { type: "int[]" },
        params: [{ name: "a", type: "int" }],
      }),
    ).toThrow(/has no join/);
  });
});
