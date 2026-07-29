# Sales by Match

The Panther robotics pit crew keeps its work gloves in one enormous plastic bin under the
build table, and nobody has ever bothered to keep left and right together. Every glove is
stamped with a colour code, and any two gloves sharing the same code are interchangeable —
so a **matched pair** is simply two gloves with the same stamp. Before the bus leaves for
Saturday's meet, the crew wants to know how many complete pairs they can pull out of the
bin. Leftover single gloves stay behind.

## Input

The first line contains a single integer $n$ — the number of gloves in the bin.

The second line contains $n$ space-separated integers $c_1, c_2, \dots, c_n$, where $c_i$
is the colour code stamped on the $i$-th glove.

## Output

Print a single integer: the largest number of matched pairs that can be formed from the
bin. Each glove may be used in at most one pair.

## Constraints

- $1 \le n \le 200000$
- $1 \le c_i \le 1000000$ for every $i$

## Example

Input:

```
7
4 3 4 4 9 3 4
```

Output:

```
3
```

Code $4$ appears four times, which makes two pairs. Code $3$ appears twice, which makes one
more pair. Code $9$ appears once and has no partner, so that glove is left in the bin.
Two plus one gives $3$ matched pairs.

A second, smaller sample:

```
3
5 5 5
```

Output: `1`. Three identical gloves form one pair, and the third glove has nothing left to
match with.
