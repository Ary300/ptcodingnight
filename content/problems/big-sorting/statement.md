# Big Sorting

Panther Robotics stamps a serial numeral on every part that comes out of the printer in
the Fine Arts Building shop, and the numbering scheme was never meant to stay small: a
revised part keeps its ancestor's full serial with new digits appended, so a part that
has been reworked all season can carry a numeral thousands of digits long. Kylie exported
the season's full part list, one serial per line, and Mr. Ritz wants it in ascending
order for the inventory binder before the trailer leaves for a Pioneer Conference
scrimmage. Every 64-bit tool the team reached for overflowed on the first row, so the
sort has to treat the serials as the enormous base-ten numbers they are.

You are given $n$ non-negative integers written as decimal numerals, one per line, with
no leading zeros. Print them in non-decreasing numeric order, one per line. The numerals
may be far too long to fit in any fixed-width integer type, so compare them as base-ten
numbers: a numeral with fewer digits is always the smaller number, and two numerals with
the same number of digits compare digit by digit from the left, exactly like a
lexicographic comparison. Duplicates must be kept: if a value appears $k$ times in the
input, it appears $k$ times in the output.

## Input

The first line contains a single integer $n$, the number of numerals.

Each of the next $n$ lines contains one numeral $a_i$, a non-empty string of decimal
digits.

## Output

Print $n$ lines: the numerals in non-decreasing numeric order, one per line.

## Constraints

- $1 \le n \le 2 \times 10^5$
- $1 \le |a_i| \le 10^6$, where $|a_i|$ is the number of digits in $a_i$
- $|a_1| + |a_2| + \dots + |a_n| \le 10^6$
- Each $a_i$ consists only of the digits 0 through 9 and has no leading zeros; the value
  zero is written as the single digit 0
- The same value may appear more than once

## Example

**Example 1**

Input:
```
4
31
415926535897932384626433832795
1
3
```
Output:
```
1
3
31
415926535897932384626433832795
```

$1$ and $3$ have one digit each and $1 < 3$, so they come first, in that order. $31$ has
two digits, so it follows every one-digit numeral even though it starts with a $3$. The
30-digit numeral $415926535897932384626433832795$ is longer than everything else and
comes last.

**Example 2**

Input:
```
6
20
0
200
20
7
100
```
Output:
```
0
7
20
20
100
200
```

The one-digit numerals $0$ and $7$ sort ahead of everything longer. $20$ appears twice in
the input, so both copies appear in the output. Among the three-digit numerals, $100$
precedes $200$ because their lengths match and the comparison falls to the first digit,
where $1 < 2$.
