# Grading Students

At the end of every quarter, Mr. Ritz finalizes the grades for his computer science
sections before report cards leave Foster Hall, and Park Tudor's registrar applies a
long-standing rounding custom before anything gets printed. Every grade is recorded as an
integer from 0 to 100. A grade sitting just below a multiple of 5 gets nudged up to it,
but a grade that is failing badly enough is left alone, on the theory that rounding a 33
to a 35 helps nobody. Kylie and Dominic offered to compute the whole list in one pass so
that Mr. Ritz stops doing it by hand with a pencil.

You are given $n$ integer grades. Apply the following rules to each grade $g$
independently. If $g$ is less than $38$, the grade is not rounded and the final grade is
$g$. Otherwise, let $r$ be the smallest multiple of $5$ that is greater than or equal to
$g$. If $r - g$ is less than $3$, the final grade is $r$; if $r - g$ is $3$ or more, the
final grade is $g$. In particular, when $g$ is already a multiple of $5$, $r = g$ and the
grade is unchanged. Print the final grade of every entry, in the order given.

## Input

The first line contains one integer $n$, the number of grades.
Each of the next $n$ lines contains one integer $g_i$, the $i$-th recorded grade.

## Output

Print $n$ lines. The $i$-th line must contain the final grade for $g_i$ after the
rounding rules are applied.

## Constraints

- $1 \le n \le 10^5$
- $0 \le g_i \le 100$

## Example

**Example 1**

Input:
```
4
73
67
38
33
```
Output:
```
75
67
40
33
```

Grade $73$: the next multiple of $5$ is $75$, and $75 - 73 = 2 < 3$, so it rounds up to
$75$. Grade $67$: the next multiple of $5$ is $70$, but $70 - 67 = 3$, which is not less
than $3$, so it stays $67$. Grade $38$: the next multiple of $5$ is $40$, and
$40 - 38 = 2 < 3$, so it becomes $40$. Grade $33$ is below $38$, so the rounding rule
never applies and it stays $33$.

**Example 2**

Input:
```
5
38
37
84
100
45
```
Output:
```
40
37
85
100
45
```

Grade $38$ is the lowest grade the rule can touch: it rounds to $40$. Grade $37$ is below
$38$, so it stays $37$ even though $40 - 37 = 3$ would already have left it alone. Grade
$84$ rounds to $85$ because $85 - 84 = 1 < 3$. Grades $100$ and $45$ are already
multiples of $5$, so $r = g$ for both and they are unchanged.
