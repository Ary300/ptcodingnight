# Panthers in a String

Before Pioneer Conference home games, the spirit committee threads letter pennants onto a
single long cord and hangs it across the Irsay Family Sports Center. The pennants come out
of the box in no particular order, so the finished banner usually reads as noise. Kylie
maintains that a banner still counts as school spirit if you can read the word `panthers`
in it from left to right, skipping pennants as needed, and Mr. Ritz, who supervises the
hanging, now grades every proposed banner by exactly that rule. He has a stack of them to
get through before the varsity game and would like a program to do the reading.

You are given $q$ query strings. For each one, decide whether the word `panthers` appears
in it as a subsequence: that is, whether you can delete zero or more characters from the
string, without reordering the characters that remain, so that the remaining characters
read exactly `panthers`. The eight letters do not need to be adjacent; they only need to
appear in the correct order.

## Input

The first line contains one integer $q$, the number of query strings.
Each of the next $q$ lines contains one string $s$ made up of lowercase English letters.

## Output

For each query, in order, print `YES` on its own line if `panthers` is a subsequence of
the string, and `NO` otherwise.

## Constraints

- $1 \le q \le 20$
- $1 \le |s| \le 10^5$ for every query string
- every string consists only of lowercase English letters `a` through `z`

## Example

**Example 1**

Input:
```
2
pxaxnxtxhxexrxs
pnathers
```
Output:
```
YES
NO
```

In `pxaxnxtxhxexrxs`, deleting every `x` leaves exactly `panthers`, so the answer is
`YES`. The string `pnathers` contains all eight letters, but not in a usable order: number
its positions $1$ through $8$ as `p n a t h e r s`. The match must start with the `p` at
position $1$ and then take the `a` at position $3$, but the only `n` sits at position $2$,
to the left of that `a`. No `n` remains available, so the answer is `NO`.

**Example 2**

Input:
```
2
ppaannextherrss
panther
```
Output:
```
YES
NO
```

In `ppaannextherrss` (positions $1$ through $15$), one valid choice is `p` at $1$, `a` at
$3$, `n` at $5$, `t` at $9$, `h` at $10$, `e` at $11$, `r` at $12$, and `s` at $14$. The
earlier `e` at position $7$ is simply skipped. So the answer is `YES`. The string
`panther` contains no `s` at all, so no selection of its characters can spell `panthers`,
and the answer is `NO`.
