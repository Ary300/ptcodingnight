# Simple Array Sum

Park Tudor's campus sits on the former Lilly family apple orchard, and the cider store
that still operates there keeps a paper ledger through the fall rush. Each afternoon the
student on duty writes down one number: how many crates of apples came in from the trees
that day. Mr. Ritz supervises the ledger, and at the end of the season he asks whoever is
on shift (this year it is Kylie) for exactly one figure to report back to the school: the
total number of crates received across every day on the list.

You are given a list of $n$ integers. Compute and print their sum.

## Input

The first line contains a single integer $n$, the number of entries in the ledger.

The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$, where $a_i$
is the number of crates recorded on day $i$.

## Output

Print a single integer on its own line: $a_1 + a_2 + \dots + a_n$.

## Constraints

- $1 \le n \le 10^5$
- $0 \le a_i \le 1000$ for every $i$
- The sum therefore never exceeds $10^8$, which fits comfortably in a 32-bit signed integer.

## Example

**Example 1**

Input:

```
6
4 0 12 7 7 3
```

Output:

```
33
```

Adding the six entries in order: $4 + 0 + 12 + 7 + 7 + 3 = 33$. The zero on the second
day still counts as a ledger entry, it just contributes nothing to the total.

**Example 2**

Input:

```
1
0
```

Output:

```
0
```

A one-day season where no crates arrived at all is still a valid ledger. The sum of that
single entry is $0$, so the program prints `0`.
