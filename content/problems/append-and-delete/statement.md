# Append and Delete

The Tribune, Park Tudor's student newspaper, still sets headlines on a salvaged
typesetting terminal in the Foster Hall basement. Only two keys on it work: one appends a
lowercase letter to the end of the current headline, and one erases the last letter. The
ribbon is nearly spent, and Kylie estimates it has $k$ key presses left in it. The headline
on screen is not the one Mr. Ritz approved, and before Kylie starts typing she wants to know
whether the ribbon will last long enough to turn it into the approved one.

You are given two strings $s$ and $t$ of lowercase English letters and an integer $k$. One
operation is either (1) append one lowercase English letter to the end of the string, or
(2) delete the last character of the string. Determine whether $s$ can be turned into
exactly $t$ using **at most** $k$ operations. Using fewer than $k$ operations is fine, and
so is using none at all when $s$ is already equal to $t$.

## Input

The first line contains the string $s$.
The second line contains the string $t$.
The third line contains the integer $k$.

## Output

Print `Yes` if $s$ can be converted into $t$ in at most $k$ operations, and `No` otherwise.

## Constraints

- $1 \le |s| \le 1000$
- $1 \le |t| \le 1000$
- $1 \le k \le 10^5$
- $s$ and $t$ consist of lowercase English letters only

## Example

**Example 1**

Input:
```
panther
pantry
7
```
Output:
```
Yes
```

The two words share the prefix `pant`. Delete the last three letters of `panther` (r, e,
h) to reach `pant`, then append `r` and `y` to reach `pantry`. That is $3 + 2 = 5$
operations, and $5$ is at most $7$, so the answer is `Yes`.

**Example 2**

Input:
```
foster
forest
6
```
Output:
```
No
```

The two words agree only on their first two letters, `fo`. Everything after that in
`foster` has to be deleted ($4$ letters, down to `fo`), and then the $4$ letters of `rest`
have to be appended. That is $8$ operations, more than the $6$ the ribbon has left.

**Example 3**

Input:
```
rose
gold
11
```
Output:
```
Yes
```

The words share no prefix. Delete all $4$ letters of `rose`, then append `g`, `o`, `l`,
`d`. That is $4 + 4 = 8$ operations, which is at most $11$.
