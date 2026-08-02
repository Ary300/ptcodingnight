# Gaming Array

Coding Night runs on a rhythm: a set of problems, then a break at the puzzle table while
Mr. Ritz grades. During one of those breaks, Kylie and Gavin push the metal puzzle aside
and lay out a row of numbered tiles instead. Their game has no choices in it at all, every
move is forced, so the winner is settled the instant the tiles hit the table, and both of
them know it. What they cannot agree on is who that winner is, and set C starts in a few
minutes, so they want it computed for every row they dealt.

The game is played on a row of $n$ tiles carrying $n$ distinct integers
$a_1, a_2, \dots, a_n$, read left to right. Kylie and Gavin alternate turns, and Kylie
always moves first. On a turn, the player locates the tile with the largest value still in
the row and removes that tile together with every tile to its right. A player whose turn
arrives when the row is already empty loses. Since every move is forced, the outcome
depends only on the starting row. Given $g$ starting rows, report the winner of each game.

## Input

The first line contains one integer $g$, the number of games.
Each game is described by two lines: the first contains one integer $n$, the number of
tiles, and the second contains $n$ space-separated distinct integers
$a_1, a_2, \dots, a_n$, the tile values from left to right.

## Output

For each game, print one line containing the winner's name: `Kylie` if the first player
wins, or `Gavin` if the second player wins.

## Constraints

- $1 \le g \le 100$
- $1 \le n \le 10^5$
- The total number of tiles across all games is at most $2 \cdot 10^5$
- $1 \le a_i \le 10^9$
- Within a single game, all tile values are distinct

## Example

**Example 1**

Input:
```
2
4
3 1 2 4
5
5 3 1 2 4
```
Output:
```
Gavin
Kylie
```

In the first game the row is $3\ 1\ 2\ 4$. The largest value is $4$, at the right end, so
Kylie removes just that tile, leaving $3\ 1\ 2$. Now the largest value is $3$, at the left
end, so Gavin removes it and everything after it, emptying the row. Kylie has nothing to
remove on her turn and loses, so Gavin wins. In the second game the row is
$5\ 3\ 1\ 2\ 4$: the largest value $5$ sits first, so Kylie's single move clears the whole
row and Gavin loses immediately.

**Example 2**

Input:
```
1
3
1 2 3
```
Output:
```
Kylie
```

With the row $1\ 2\ 3$, every move removes exactly one tile from the right end: Kylie
takes $3$, Gavin takes $2$, Kylie takes $1$. The row is empty when Gavin's turn comes
around, so Kylie wins after three moves.
