# Weighted Uniform Strings

The cider store on Park Tudor's campus, a holdover from the Lilly family apple orchard the
school was built on, stamps every jug with a one-letter batch code, and jugs from the same
pressing come off the line in unbroken blocks of the same letter. Kylie keeps the season's
ledger as one long strip of these stamps, in press order. Mr. Ritz audits the store by
weight: a block of consecutive matching stamps is billed at the value of its letter (a is
1, z is 26) times the number of stamps taken from it. He keeps reading totals off old
invoices and asking Kylie whether each total could have come from a single unbroken block
of matching stamps somewhere on her strip.

You are given a string $s$ of lowercase English letters and $q$ query integers. Each
letter has a fixed weight: a weighs $1$, b weighs $2$, and so on up to z, which weighs
$26$. A substring of $s$ is called uniform if every character in it is the same letter,
and the weight of a uniform substring is the weight of that letter multiplied by the
length of the substring. For each query value $x_i$, determine whether $s$ contains at
least one uniform substring whose weight is exactly $x_i$.

## Input

The first line contains the string $s$.
The second line contains one integer $q$, the number of queries.
Each of the next $q$ lines contains one integer $x_i$, a queried weight.

## Output

Print $q$ lines. On the $i$-th line print `Yes` if some uniform substring of $s$ has
weight exactly $x_i$, and `No` otherwise.

## Constraints

- $1 \le |s| \le 10^5$
- $s$ consists of lowercase English letters only
- $1 \le q \le 10^5$
- $1 \le x_i \le 10^7$

## Example

**Example 1**

Input:
```
abccdd
5
1
3
6
7
8
```
Output:
```
Yes
Yes
Yes
No
Yes
```

The uniform substrings of `abccdd` are `a`, `b`, `c`, `cc`, `d`, and `dd`. Their weights
are $1$, $2$, $3$, $3 \cdot 2 = 6$, $4$, and $4 \cdot 2 = 8$, so the achievable set is
$\{1, 2, 3, 4, 6, 8\}$. Queries $1$, $3$, $6$, and $8$ are in the set. Query $7$ is not:
no single letter here weighs $7$, and the only longer uniform substrings, `cc` and `dd`,
weigh $6$ and $8$.

**Example 2**

Input:
```
ppp
4
16
32
48
49
```
Output:
```
Yes
Yes
Yes
No
```

The letter p weighs $16$, and the uniform substrings of `ppp` are `p`, `pp`, and `ppp`,
with weights $16$, $32$, and $48$. The first three queries hit those weights exactly.
Nothing weighs $49$: it is not a multiple of $16$, so no run of p can produce it.
