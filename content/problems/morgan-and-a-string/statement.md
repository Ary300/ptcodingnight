# Morgan and a String

The senior rose procession forms in the lobby of Ayres Auditorium as two single-file
lines, one at each door. This year Mr. Ritz taped a large printed letter to every rose
box, and he merges the two lines himself: at each step he waves in the front student
from one line or the other, so each line keeps its own order while the two interleave
into a single line down the center aisle. Kylie, covering the procession for the
Tribune, reads the letters off the boxes as students pass and writes them down as one
long string. Mr. Ritz, who alphabetizes everything he is allowed to alphabetize, wants
the string Kylie ends up with to be the alphabetically earliest one his choices can
produce.

You are given two strings $a$ and $b$ of uppercase letters. Build a string $c$ of
length $|a| + |b|$ by repeatedly removing the first character of either $a$ or $b$,
your choice at every step, and appending it to the end of $c$, until both strings are
empty. Each of $a$ and $b$ keeps its internal order inside $c$. Among all strings
obtainable this way, print the lexicographically smallest one. (String $x$ is
lexicographically smaller than string $y$ if, at the first position where they differ,
$x$ has the earlier letter.)

## Input

The first line contains the string $a$.
The second line contains the string $b$.

## Output

Print one line: the lexicographically smallest string $c$ that can be built as
described.

## Constraints

- $1 \le |a| \le 10^4$
- $1 \le |b| \le 10^4$
- $a$ and $b$ consist only of uppercase English letters, `A` through `Z`

## Example

**Example 1**

Input:
```
ACA
B
```
Output:
```
ABCA
```

Start with $a =$ `ACA` and $b =$ `B`. Take `A` from $a$ (since `A` is
earlier than `B`), leaving $a =$ `CA`. Now `B` is earlier than `C`, so take `B`
from $b$, emptying it. The rest of $a$ follows, giving `ABCA`.

**Example 2**

Input:
```
CA
C
```
Output:
```
CAC
```

Both fronts are `C`, so the first letter of $c$ is `C` either way, and the choice is
decided by what each line still has behind its front. Taking the `C` from $b$ first
forces `CCA`: after it, `C` from $a$ still blocks the `A`. Taking the `C` from $a$
first exposes the `A` immediately and gives `CAC`. Since `CAC` is smaller than `CCA`,
the answer is `CAC`. When the front letters tie, comparing only those letters is not
enough: the whole remainders decide.
