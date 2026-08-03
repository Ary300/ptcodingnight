# Tribune Tally

The Tribune, Park Tudor's student newspaper, keeps a digital archive of every issue it has
printed, and Kylie maintains the word index from a corner room in Foster Hall. Whenever a
tracked word appears in print, the indexing script appends one line to the ledger: the
issue number it appeared in and the word itself. The ledger is append-only and nothing
about it is sorted. Before each editorial meeting the staff sends Kylie a list of words
they care about, and rereading the whole ledger for every single word stopped being
practical around the time the ledger passed a hundred thousand lines.

You are given the ledger and the staff's list of query words. For each query word, report
two numbers: how many ledger lines record that word in total, and how many distinct issue
numbers those lines mention. A word the ledger has never recorded scores zero on both
counts. Words match only if they are exactly equal.

## Input

The first line contains two integers $n$ and $q$, the number of ledger lines and the
number of queries.

Each of the next $n$ lines contains an integer $b_i$ and a word $w_i$, separated by a
space: one recorded appearance of word $w_i$ in issue $b_i$. The same issue number and
word may appear on many lines.

Each of the last $q$ lines contains a single word $t_j$, one query.

## Output

Print $q$ lines. On the $j$-th line print two space-separated integers: the total number
of ledger lines whose word equals $t_j$, followed by the number of distinct issue numbers
among those lines.

## Constraints

- $1 \le n \le 100000$
- $1 \le q \le 100000$
- $1 \le b_i \le 10^9$
- Every word consists of lowercase English letters only, with length between $1$ and $20$.

## Example

**Example 1**

Input:
```
6 3
12 orchard
12 cider
15 orchard
12 orchard
9 panthers
15 cider
orchard
cider
foster
```
Output:
```
3 2
2 2
0 0
```

The word `orchard` is recorded on three ledger lines, and those lines mention issues $12$
and $15$, so two distinct issues. The word `cider` appears twice, once in issue $12$ and
once in issue $15$. The word `foster` never appears in the ledger, so both of its numbers
are zero.

**Example 2**

Input:
```
5 2
3 tribune
3 tribune
3 tribune
7 tribune
7 tribune
tribune
robotics
```
Output:
```
5 2
0 0
```

All five ledger lines record `tribune`: three in issue $3$ and two in issue $7$, for a
total of five appearances across two distinct issues. The word `robotics` is absent, so
it scores $0$ $0$.
