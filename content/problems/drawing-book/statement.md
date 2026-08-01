# Drawing Book

The Park Tudor robotics team printed a fat spiral-bound build journal for the season, and it
is now the most fought-over object in the shop. Pages are numbered $1$ through $n$. Because
of how the shop printer folded it, opening the front cover shows page $1$ alone on the right,
and every flip after that reveals a two-page spread: pages $2$ and $3$, then $4$ and $5$, and
so on. In other words, the spread numbered $k$ (counting from $0$) holds pages $2k$ and
$2k+1$, and any page that would be numbered above $n$ simply does not exist.

Mentors keep shouting page numbers across the room. You may start from the front cover and
flip forward, or start from the back cover and flip backward, whichever is fewer flips. Tell
each mentor how many flips they need.

## Input

The first line contains one integer $n$, the number of numbered pages in the journal.
The second line contains one integer $q$, the number of requests.
Each of the next $q$ lines contains one integer $p$, a page a mentor asked for.

## Output

Print $q$ lines. Line $i$ is the minimum number of flips needed to make page $p_i$ visible,
starting from whichever cover is cheaper.

## Constraints

- $1 \le n \le 10^{9}$
- $1 \le q \le 10^{5}$
- $1 \le p_i \le n$

## Example

**Input**

```
7
3
3
6
1
```

**Output**

```
1
0
0
```

The journal has spreads `[1]`, `[2,3]`, `[4,5]`, `[6,7]`. Page $3$ sits on spread $1$, so it
is one flip from the front and two from the back, so the answer is $1$. Page $6$ is on the very last
spread, visible the instant you open the back cover. Page $1$ is visible the instant you open
the front cover.

A second, smaller journal has $n = 4$, $q = 2$ and the requests $3$ then $4$; the answers are
`1` and `0`. Its spreads are `[1]`, `[2,3]`, `[4]`, so page $3$ is one flip from the front and
one from the back (ties are fine), while page $4$ greets you when the back cover opens.
