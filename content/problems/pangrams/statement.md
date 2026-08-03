# Pangrams

Before each issue of The Tribune goes to print, the layout desk in Foster Hall proofs its
display fonts by typesetting a single test sentence at every headline size. Mr. Ritz has one
standing rule for the proof sheet: the test sentence must use every letter of the alphabet
at least once, because a glyph that never appears is a glyph that never gets checked, and a
broken one slips straight into the paper. Kylie keeps a folder of candidate sentences and
would rather have a program decide which ones qualify than tick off letters by hand.

Given a single line of text, determine whether it is a pangram: a string that contains
every letter of the English alphabet, from a to z, at least once. Letter case is ignored,
so an uppercase `Q` counts the same as a lowercase `q`. Spaces are the only non-letter
characters that can occur, and they are ignored.

## Input

A single line containing the string $s$. The line consists of uppercase English letters,
lowercase English letters, and spaces.

## Output

Print `pangram` if $s$ contains every letter of the alphabet at least once, ignoring case.
Otherwise print `not pangram`.

## Constraints

- $1 \le |s| \le 10^5$
- $s$ contains only the characters `A`-`Z`, `a`-`z`, and the space character

## Example

**Example 1**

Input:
```
A jury of quick brown Panthers vexed the lazy climbing dogs
```
Output:
```
pangram
```

Checking the rare letters: `j` appears in `jury`, `q` in `quick`, `x` in `vexed`, `z` in
`lazy`, and `v` in `vexed`. Going through all 26 letters the same way, each one appears at
least once (the capital `A` and capital `P` count as `a` and `p`), so the sentence is a
pangram.

**Example 2**

Input:
```
Coding Night runs on apple cider and metal puzzles
```
Output:
```
not pangram
```

Ignoring case, this sentence uses only 17 distinct letters:
`a c d e g h i l m n o p r s t u z`. The nine letters `b f j k q v w x y` never appear, so
it is not a pangram. Missing even a single letter would already be enough to disqualify it.
