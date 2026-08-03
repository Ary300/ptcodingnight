# Permuting Two Arrays

Coding Night in Foster Hall runs table by table: each team station gets exactly one
laptop from the club cart and exactly one external battery pack from the bin next to
it. The laptops come back from a school day with whatever charge they have left, the
packs hold whatever the last event left in them, and Mr. Ritz wants every station to
survive the full evening, which takes a combined runtime of at least $k$ minutes. He
is not going to shuffle hardware between rooms mid-contest, so before the doors open
he checks each room's cart on paper: is there any way to hand out these laptops and
these packs, one of each per table, so that no table dies before the last set ends?

You are given $q$ independent queries. Each query supplies an integer $k$ and two
arrays $A$ and $B$, each containing $n$ non-negative integers. Decide whether $B$ can
be reordered (permuted) so that $A_i + B_i \ge k$ for every index $i$ with
$1 \le i \le n$. Only the pairing between elements matters, so permuting $A$ as well
adds no new possibilities.

## Input

The first line contains one integer $q$, the number of queries.

Each query then consists of three lines:

- one line with two integers $n$ and $k$,
- one line with $n$ space-separated integers $a_1, a_2, \dots, a_n$, the array $A$,
- one line with $n$ space-separated integers $b_1, b_2, \dots, b_n$, the array $B$.

## Output

For each query, print `YES` on its own line if some permutation of $B$ makes
$A_i + B_i \ge k$ hold at every index, and `NO` otherwise.

## Constraints

- $1 \le q \le 10$
- $1 \le n \le 10^4$
- $0 \le a_i, b_i \le 10^9$
- $0 \le k \le 2 \cdot 10^9$

## Example

**Example 1**

Input:
```
2
3 10
2 5 7
8 5 3
2 5
1 1
3 4
```
Output:
```
YES
NO
```

In the first query, pair $2$ with $8$, $5$ with $5$, and $7$ with $3$. The sums are
$10$, $10$, and $10$, all at least $k = 10$, so the answer is `YES`. In the second
query the two possible pairings give sums $(1+3, 1+4) = (4, 5)$ and
$(1+4, 1+3) = (5, 4)$; each contains a $4$, which is below $k = 5$, so the answer is
`NO`.

**Example 2**

Input:
```
1
4 7
0 4 3 6
1 6 3 7
```
Output:
```
YES
```

Reorder $B$ as $7, 3, 6, 1$. The sums against $A = 0, 4, 3, 6$ are $0+7 = 7$,
$4+3 = 7$, $3+6 = 9$, and $6+1 = 7$, all at least $k = 7$, so the answer is `YES`.
