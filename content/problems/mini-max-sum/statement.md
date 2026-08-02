# Mini-Max Sum

The cider store on the Park Tudor campus still presses apples every fall, a holdover from
the days when the 68 acres were the Lilly family's orchard. This year Mr. Ritz has five
crates of apples staged behind Foster Hall, each crate marked with its weight, and one
hand cart that carries exactly four crates per trip. Kylie is doing the pushing, so before
she agrees to anything she wants two numbers: the lightest load a trip could possibly be,
and the heaviest.

You are given five integers. Among all ways to choose exactly four of them, compute the
smallest possible sum and the largest possible sum of the chosen four.

## Input

A single line containing five space-separated integers $a_1, a_2, a_3, a_4, a_5$.

## Output

Print two space-separated integers on one line: first the minimum sum of four of the five
integers, then the maximum sum of four of the five integers.

## Constraints

- Exactly $5$ integers are given.
- $0 \le a_i \le 10^9$ for every $i$.
- The maximum sum can be as large as $4 \times 10^9$, which does not fit in a signed
  32-bit integer. Use a 64-bit type where that matters.

## Example

**Example 1**

Input:
```
1 3 5 7 9
```
Output:
```
16 24
```

The full sum is $1 + 3 + 5 + 7 + 9 = 25$. Leaving out the largest value, $9$, gives the
minimum load $25 - 9 = 16$. Leaving out the smallest value, $1$, gives the maximum load
$25 - 1 = 24$.

**Example 2**

Input:
```
2 9 9 3 6
```
Output:
```
20 27
```

The full sum is $2 + 9 + 9 + 3 + 6 = 29$. Two crates are tied at $9$; dropping either one
gives the minimum $29 - 9 = 20$. Dropping the lightest crate, $2$, gives the maximum
$29 - 2 = 27$.
