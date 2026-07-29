# Encryption

The Park Tudor robotics team keeps its drive-code passwords on index cards, which worked
fine until a card fell out of a backpack on the bus back from a meet. The captain's fix is
a paper cipher: pick a keyword, write the secret into a grid one row at a time, then read
the grid back one column at a time in an order the keyword decides. Your job is to write
the program so nobody has to do it by hand at 7pm.

## Input

The first line contains an integer $n$, the number of secrets to encrypt.
Each of the next $n$ pairs of lines describes one secret: a line holding the keyword $k$,
then a line holding the message $m$. Both are non-empty strings of lowercase English
letters with no spaces.

To encrypt, let $w$ be the length of the keyword. Write the message left to right into rows
of exactly $w$ characters, starting a new row whenever one fills up. If the final row is
short, pad it with the letter `x` until the grid is a full rectangle. Now order the columns:
column $i$ comes before column $j$ if the keyword's $i$-th letter is alphabetically earlier
than its $j$-th letter, and if the two letters are equal the smaller index comes first.
Read each column top to bottom in that order and join the letters into one string.

## Output

Print $n$ lines. Line $t$ is the ciphertext for the $t$-th message.

## Constraints

- $1 \le n \le 100$
- $1 \le |k| \le 20$
- $1 \le |m| \le 2000$
- Every character of $k$ and $m$ is in `a`–`z`.

## Example

Sample 1 input:

```
2
cab
panthers
night
robotics
```

Sample 1 output:

```
ahsnexptr
bsoxocritx
```

For the first secret the keyword `cab` gives a width of 3, so `panthers` fills the grid
`pan` / `the` / `rsx` — the last row was one short, so it took an `x`. Sorting `c`,`a`,`b`
alphabetically reads column 1 first (`ahs`), then column 2 (`nex`), then column 0 (`ptr`).

Sample 2 input:

```
1
z
codingnight
```

Sample 2 output:

```
codingnight
```

A one-letter keyword makes a grid one column wide, so the message comes back unchanged.
