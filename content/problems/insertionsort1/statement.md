# Insertion Sort - Part 1

The cider store on the Park Tudor campus still presses from trees left over from the
Lilly family apple orchard, and the shelf behind the register holds a single row of jugs
arranged by press day, earliest on the left. When Mr. Ritz drops off a late jug it gets
set down in the last slot on the right, out of order, and whoever is on shelf duty,
Kylie this week, slides jugs one slot at a time to open a gap where the new one belongs.
The store's ledger records the full shelf order after every single slide, which is
tedious for Kylie and an exact specification for you.

You are given an array whose first $n-1$ values are already in non-decreasing order; the
last value is the one that needs to be inserted. Store the last value in a variable,
leaving a gap at the final position. Then walk left through the sorted prefix: as long
as the value immediately left of the gap is strictly greater than the stored value, copy
that value one position to the right (into the gap) and print the entire array. When the
walk stops, either because the value to the left is not greater or because the gap has
reached the front, write the stored value into the gap and print the entire array one
final time. Note that a value equal to the stored value is not copied: the comparison is
strictly greater.

## Input

The first line contains one integer $n$, the size of the array.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$. The prefix
$a_1, a_2, \dots, a_{n-1}$ is in non-decreasing order.

## Output

Print one line for every copy performed, and then one final line after the stored value
is written into the gap. Each line contains the full array at that moment, as $n$
space-separated integers. If no copies are needed, the output is a single line equal to
the input array.

## Constraints

- $1 \le n \le 1000$
- $-10^4 \le a_i \le 10^4$

## Example

**Example 1**

Input:
```
5
2 4 6 8 3
```
Output:
```
2 4 6 8 8
2 4 6 6 8
2 4 4 6 8
2 3 4 6 8
```

The stored value is $3$. First $8 > 3$, so $8$ is copied right, giving `2 4 6 8 8`. Then
$6 > 3$ gives `2 4 6 6 8`, and $4 > 3$ gives `2 4 4 6 8`. The next value left of the gap
is $2$, which is not greater than $3$, so $3$ is written into the gap and the final line
`2 3 4 6 8` is printed. Three copies plus the final placement make four lines.

**Example 2**

Input:
```
6
1 3 5 5 9 5
```
Output:
```
1 3 5 5 9 9
1 3 5 5 5 9
```

The stored value is $5$. Since $9 > 5$, the $9$ is copied right, giving `1 3 5 5 9 9`.
The next value to the left is $5$, and $5 > 5$ is false, so the walk stops there: the
stored $5$ is written into the gap, giving `1 3 5 5 5 9`. Equal values are never copied.
