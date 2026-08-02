# Larry's Array

The cider store that still operates on Park Tudor's campus, a holdover from the years
when the 68 acres at 7200 N. College Avenue were the Lilly family's apple orchard, takes
its fall deliveries in numbered crates. Dominic restocks the shelf on Coding Night
weekends and wants crates $1$ through $n$ standing in increasing order. The store's crate
turner is built for exactly one maneuver: grip three crates sitting side by side and
cycle them one place to the left, so the leftmost crate of the trio ends up on its right
end. Dominic can repeat the maneuver as often as he likes, anywhere on the shelf, but no
other move is possible. Before he wears himself out, he asks Mr. Ritz, who is supervising
the shift, to tell him for each shelf whether it can be sorted at all.

You are given $q$ shelves. Each shelf is a permutation $p_1, p_2, \dots, p_n$ of the
integers $1$ through $n$. One operation chooses an index $i$ with $1 \le i \le n-2$ and
replaces the block $(p_i, p_{i+1}, p_{i+2})$ with $(p_{i+1}, p_{i+2}, p_i)$. For each
shelf, decide whether some sequence of zero or more operations transforms it into
$1, 2, \dots, n$.

## Input

The first line contains one integer $q$, the number of shelves.
Each shelf is then described by two lines: a line containing one integer $n$, followed by
a line containing $n$ space-separated integers $p_1, p_2, \dots, p_n$, a permutation of
$1$ through $n$.

## Output

For each shelf, in the order given, print `YES` on its own line if the shelf can be
transformed into $1, 2, \dots, n$ by the operation, and `NO` otherwise.

## Constraints

- $1 \le q \le 30$
- $1 \le n \le 10^5$
- The sum of $n$ over all shelves in one input does not exceed $3 \times 10^5$
- Each shelf is a permutation of $1$ through $n$: every integer in that range appears exactly once

## Example

**Example 1**

Input:
```
2
3
3 1 2
4
1 2 4 3
```
Output:
```
YES
NO
```

On the first shelf, one operation at $i = 1$ cycles $(3, 1, 2)$ into $(1, 2, 3)$, and the
shelf is sorted. On the second shelf, crates $4$ and $3$ must trade places while crates
$1$ and $2$ stay put. Listing every arrangement the operation can reach from
$1\ 2\ 4\ 3$ produces only $12$ of the $24$ possible orderings of four crates, and
$1\ 2\ 3\ 4$ is not among them, so the answer is `NO`.

**Example 2**

Input:
```
2
5
1 2 3 4 5
6
2 1 3 4 5 6
```
Output:
```
YES
NO
```

The first shelf is already in order, so zero operations suffice and the answer is `YES`.
On the second shelf only crates $2$ and $1$ are out of place, but every operation moves
three crates at once, and no sequence of them swaps exactly two neighbors while returning
everything else to its spot. The answer is `NO`.
