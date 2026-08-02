# Ice Cream Parlor

The cider store on the orchard corner of campus scoops ice cream during Coding Night, and
between sets B and C every team sends two people across the lawn with the team's snack
money. Mr. Ritz runs the till the way he grades: the amount he hands each pair must be
spent exactly, no change back and nothing added from your own pocket, on two different
flavors from the board. Kylie and Navraj managed it on the first trip; most teams stare
at the price list until the break is nearly over. The prices change between trips, so a
combination that worked once is no help the next time.

You will process $t$ independent trips. On each trip you are given a budget $m$ and the
current price list of $n$ flavors, where flavor $i$ costs $c_i$. For every trip it is
guaranteed that exactly one pair of distinct flavors $i < j$ satisfies $c_i + c_j = m$.
Find that pair and report the two flavor numbers.

## Input

The first line contains one integer $t$, the number of trips.

Each trip is then described by three lines:

- one integer $m$, the budget for the trip,
- one integer $n$, the number of flavors on the board,
- $n$ space-separated integers $c_1, c_2, \dots, c_n$, where $c_i$ is the cost of
  flavor $i$.

## Output

For each trip, print one line with two space-separated integers: the 1-based numbers of
the two chosen flavors, in increasing order.

## Constraints

- $1 \le t \le 10$
- $2 \le n \le 10^5$ for each trip
- the total of $n$ over all trips in one input does not exceed $3 \times 10^5$
- $1 \le c_i \le 10^9$
- $2 \le m \le 2 \times 10^9$
- in every trip, exactly one pair of distinct flavors $i < j$ has $c_i + c_j = m$
- two distinct flavors may have the same cost

## Example

**Example 1**

Input:
```
1
6
4
1 3 5 4
```
Output:
```
1 3
```

The budget is $6$ and the four flavors cost $1$, $3$, $5$, $4$. Flavors $1$ and $3$ cost
$1 + 5 = 6$, exactly the budget. No other pair works: $1+3=4$, $1+4=5$, $3+5=8$, $3+4=7$,
and $5+4=9$. So the answer is `1 3`.

**Example 2**

Input:
```
2
8
5
2 6 4 3 9
10
4
5 8 5 3
```
Output:
```
1 2
1 3
```

Two trips. On the first, the budget is $8$ and flavors $1$ and $2$ cost $2 + 6 = 8$; no
other pair of the five prices sums to $8$. On the second, the budget is $10$ and flavors
$1$ and $3$ each cost $5$, so together they cost $5 + 5 = 10$. They are different flavors
that happen to share a price, which is allowed; flavor $2$ at $8$ and flavor $4$ at $3$
combine with nothing to make $10$.
