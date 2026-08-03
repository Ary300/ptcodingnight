# Chocolate Feast

The cider store on the orchard side of campus, a holdover from the days when the 68 acres
at 7200 N. College Avenue were still the Lilly family's apple orchard, stocks a shelf of
chocolate bars during Coding Night. This year the store runs a wrapper promotion: return
enough empty wrappers and you get one bar free, and the free bar comes in a wrapper of its
own. Between sets B and C, Mr. Ritz hands Navraj the team's snack budget and sends him
across campus. Navraj plans to buy as many bars as the money allows, then keep feeding
wrappers back over the counter until he cannot claim another free bar, and he wants the
final count settled before he leaves the table.

You are given the amount of money $n$, the price $c$ of one chocolate bar, and the number
of wrappers $m$ that the store exchanges for one free bar. First, as many bars as possible
are bought outright, which yields $\lfloor n / c \rfloor$ bars, each with a wrapper. Then,
as long as at least $m$ wrappers are on hand, $m$ of them are traded for one more bar,
which adds one to the bar total and one wrapper to the pile. Compute the total number of
bars obtained once no further trade is possible.

## Input

A single line contains three space-separated integers $n$, $c$, and $m$: the money
available, the cost of one bar, and the number of wrappers required for a free bar.

## Output

Print a single integer: the total number of chocolate bars obtained, counting both the
bars bought with money and the bars claimed through wrapper trades.

## Constraints

- $2 \le n \le 10^5$
- $1 \le c \le n$
- $2 \le m \le n$

## Example

**Example 1**

Input:
```
10 2 5
```
Output:
```
6
```

With $10$ dollars and bars priced at $2$, Navraj buys $\lfloor 10 / 2 \rfloor = 5$ bars
and holds $5$ wrappers. Since $m = 5$, he trades all $5$ wrappers for one free bar,
bringing the total to $6$ and leaving him with the single wrapper from the free bar. One
wrapper is fewer than $5$, so no further trade is possible and the answer is $6$.

**Example 2**

Input:
```
6 2 2
```
Output:
```
5
```

He buys $\lfloor 6 / 2 \rfloor = 3$ bars and holds $3$ wrappers. Trading $2$ of them gives
a fourth bar, and its wrapper joins the one left over, so he holds $2$ wrappers again.
Trading those gives a fifth bar and leaves $1$ wrapper, which is fewer than $2$, so the
feast ends at $5$ bars.
