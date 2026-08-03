# Two Characters

The cider store on the orchard end of campus wraps each jug in a paper band, and Mr. Ritz
ordered a custom band for the Coding Night refreshment table in Foster Hall. Oliver, who
runs that table between rounds of the metal puzzle, was handed a strip of letter stickers
that reads as a jumble, and he thinks a band only looks right when it alternates between
exactly two letters, like `ababab`. The sticker sheets are cut by letter: peeling one
letter's backing strip removes every copy of that letter from the band at once, and the
surviving stickers slide together without changing order.

You are given a string $s$ of lowercase English letters. Choose any set of letters and
delete every occurrence of each chosen letter from $s$; a letter either stays everywhere
or is removed everywhere, and the remaining characters keep their original order. The
result is valid if it contains exactly two distinct letters and no two adjacent characters
in it are equal, so it alternates between those two letters for its entire length. Print
the length of the longest valid result, or $0$ if no valid result can be formed.

## Input

The first line contains one integer $n$, the length of the string.
The second line contains the string $s$, consisting of $n$ lowercase English letters.

## Output

Print a single integer: the length of the longest valid string obtainable by deleting
letters as described, or $0$ if none exists.

## Constraints

- $1 \le n \le 10^4$
- $s$ consists of lowercase English letters (`a` to `z`) only

## Example

**Example 1**

Input:
```
10
cidercider
```
Output:
```
4
```

Keeping only the letters `c` and `i` (deleting every `d`, `e`, and `r`) leaves `cici`,
which uses exactly two distinct letters and never repeats a letter twice in a row, so it
is valid with length $4$. Keeping three letters can never help: `cidcid` (keeping `c`,
`i`, `d`) has no equal adjacent pair, but it uses three distinct letters, so it is not
valid. No letter appears more than twice in the string, so no pair can beat length $4$.

**Example 2**

Input:
```
7
panther
```
Output:
```
2
```

All seven letters of `panther` are distinct, so whichever two letters survive, each
appears exactly once. Keeping `p` and `a`, for instance, leaves `pa`: exactly two
distinct letters, no equal neighbors, length $2$. No pair can do better.

**Example 3**

Input:
```
8
aabbaabb
```
Output:
```
0
```

Only the letters `a` and `b` occur, so the only possible choice is to keep both, and that
leaves the whole string `aabbaabb`, which has equal adjacent characters. Note that you
cannot peel off just one of the two leading `a` stickers to rescue it: a letter is kept
everywhere or deleted everywhere. No valid result exists, so the answer is $0$.
