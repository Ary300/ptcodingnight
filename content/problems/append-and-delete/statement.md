# Append and Delete

The Tribune, Park Tudor's student newspaper, still sets headlines on a salvaged
typesetting terminal in the Foster Hall basement. Only two keys on it work: one appends a
lowercase letter to the end of the current headline, and one erases the last letter. The
keystroke counter, however, has never failed. After a layout session Kylie finds that the
headline she left on screen went to print as something else, and the counter shows exactly
$k$ presses since she stepped out. Mr. Ritz, who signs off on every issue, will not approve
the page until someone confirms the printed headline is even consistent with that count.

You are given two strings $s$ and $t$ of lowercase English letters and an integer $k$. One
operation is either (1) append one lowercase English letter to the end of the string, or
(2) delete the last character of the string. Deleting when the string is empty is allowed:
it counts as one operation and the string stays empty. Determine whether $s$ can be turned
into exactly $t$ using exactly $k$ operations, no more and no fewer.

## Input

The first line contains the string $s$.
The second line contains the string $t$.
The third line contains the integer $k$.

## Output

Print `Yes` if $s$ can be converted into $t$ in exactly $k$ operations, and `No` otherwise.

## Constraints

- $1 \le |s| \le 10^4$
- $1 \le |t| \le 10^4$
- $1 \le k \le 10^9$
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
h) to reach `pant`, then append `r` and `y` to reach `pantry`: that is $3 + 2 = 5$
operations. The remaining $2$ presses are burned by appending any letter and immediately
deleting it, for exactly $7$ operations in total.

**Example 2**

Input:
```
cider
cider
3
```
Output:
```
No
```

`cider` has $5$ letters, so $3$ presses can never empty the string, and every press
therefore changes the length by exactly one. After $3$ presses the length is even, but the
target `cider` has $5$ letters, so no sequence of exactly $3$ operations works.

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

The words share no prefix. Delete all $4$ letters of `rose`, press delete $3$ more times
on the empty string (each press counts but changes nothing), then append `g`, `o`, `l`,
`d`. That is $4 + 3 + 4 = 11$ operations exactly.
