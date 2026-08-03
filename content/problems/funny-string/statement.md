# Funny String

Between sets B and C at Coding Night, while the metal puzzle makes its rounds and one
table argues about Connections, Mr. Ritz puts a warm-down exercise on the Foster Hall
projector. He has been collecting words all week: "noon" from a Tribune headline,
"cider" from the label at the store on the old orchard, "panther" for obvious reasons.
He wants each word sorted into one of two piles by a rule he refuses to state until a
team writes a program for it: a word goes in the first pile exactly when reading it
forward and reading it backward produce the same sequence of letter-to-letter jumps.

You are given $q$ lowercase strings and must classify each one independently. For a
string $s = s_1 s_2 \dots s_n$, let $r = s_n s_{n-1} \dots s_1$ be $s$ reversed, and let
$c(x)$ be the ASCII code of character $x$. Call $s$ funny when
$|c(s_i) - c(s_{i-1})| = |c(r_i) - c(r_{i-1})|$ holds for every $i$ with $2 \le i \le n$.
For each string, print `Funny` if it is funny and `Not Funny` otherwise.

## Input

The first line contains one integer $q$, the number of strings.
Each of the next $q$ lines contains one string $s$.

## Output

Print $q$ lines. The $k$-th line is `Funny` if the $k$-th string is funny, and
`Not Funny` otherwise.

## Constraints

- $1 \le q \le 20$
- $2 \le |s| \le 10^5$
- $s$ consists of lowercase English letters only

## Example

**Example 1**

Input:
```
2
noon
cider
```
Output:
```
Funny
Not Funny
```

The codes of `noon` are $110, 111, 111, 110$, so the forward jumps are
$|111-110|, |111-111|, |110-111| = 1, 0, 1$. Reversing `noon` gives `noon` again, so the
backward jumps are also $1, 0, 1$ and the word is funny. The codes of `cider` are
$99, 105, 100, 101, 114$, giving forward jumps $6, 5, 1, 13$. Its reverse `redic` has
codes $114, 101, 100, 105, 99$ and jumps $13, 1, 5, 6$. Already at $i = 2$ the jumps
disagree ($6 \ne 13$), so `cider` is not funny.

**Example 2**

Input:
```
2
bdbd
panther
```
Output:
```
Funny
Not Funny
```

The codes of `bdbd` are $98, 100, 98, 100$ and the forward jumps are $2, 2, 2$. Its
reverse `dbdb` has codes $100, 98, 100, 98$ and jumps $2, 2, 2$ as well, so `bdbd` is
funny even though it is not a palindrome. The codes of `panther` are
$112, 97, 110, 116, 104, 101, 114$, giving forward jumps $15, 13, 6, 12, 3, 13$; the
reverse `rehtnap` gives $13, 3, 12, 6, 13, 15$, and $15 \ne 13$ at $i = 2$, so
`panther` is not funny.
