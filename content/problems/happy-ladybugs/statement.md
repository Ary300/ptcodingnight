# Happy Ladybugs

Park Tudor's 68 acres were once the Lilly family's apple orchard, and the cider store
that still operates on campus gets a reliable ladybug bloom every fall. Above the
register the store keeps a magnet strip divided into cells, and during a slow stretch of
Coding Night, somewhere between set B and the train tracks, Navraj arranged the store's
ladybug magnets along it, one per cell, leaving some cells empty. Mr. Ritz, supervising
the room, wants a YES or NO for each strip Navraj produces.

You are given $g$ boards. A board is a row of $n$ cells described by a string $b$ of
length $n$: each character is either an uppercase letter from A to Z, meaning the cell
holds a ladybug of that color, or an underscore, meaning the cell is empty. A ladybug is
happy when at least one of the cells directly next to it (immediately to its left or
immediately to its right) holds a ladybug of the same color. Any ladybug may fly from its
current cell to any empty cell, which leaves its former cell empty; moves may be repeated
any number of times and in any order. For each board, decide whether some sequence of
moves makes every ladybug on the board happy. A board that holds no ladybugs already
counts as happy.

## Input

The first line contains one integer $g$, the number of boards.
Each board is then described by two lines: the first contains an integer $n$, the number
of cells, and the second contains a string $b$ of exactly $n$ characters, each an
uppercase letter A to Z or an underscore.

## Output

For each board, in the order given, print `YES` if every ladybug on that board can be
made happy and `NO` otherwise, one word per line.

## Constraints

- $1 \le g \le 100$
- $1 \le n \le 10^5$
- The total number of cells across all boards in one input is at most $5 \times 10^5$
- $b$ contains only the characters `A` through `Z` and `_`

## Example

**Example 1**

Input:
```
3
7
RBY_YBR
6
X_Y__X
2
__
```
Output:
```
YES
NO
YES
```

On the first board each of the colors R, B, and Y appears exactly twice and cell $4$ is
empty. Using the empty cell, the ladybugs can be rearranged one flight at a time into
`RRBBYY_`, where every ladybug sits beside its matching partner, so the answer is YES.
On the second board the color Y appears only once; no move can ever put a second Y next
to it, so the answer is NO. The third board holds no ladybugs at all, so it already
counts as happy: YES.

**Example 2**

Input:
```
2
5
AABBC
6
AABBCC
```
Output:
```
NO
YES
```

The board `AABBC` has no empty cell, so no ladybug can move; the board must already be
happy, but the single C in cell $5$ has no C beside it, so the answer is NO. The board
`AABBCC` also has no empty cell, but every one of its $6$ ladybugs already sits next to a
same-color partner, so the answer is YES.
