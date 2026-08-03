# Counting Sort 2

Park Tudor's 68 acres in Meridian Hills used to be the Lilly family's apple orchard, and
the cider store on campus still runs pressings every fall. Each crate that comes off the
press gets a two-digit quality score from 0 to 99, written on a paper slip and dropped in
a box in whatever order the crates were finished. Mr. Ritz supervises the tally, and he
does not want a summary or a winner: he wants the complete list of scores rewritten in
ascending order, every duplicate slip included, so the season's grade sheet reads low to
high.

You are given a list of $n$ integers, each between $0$ and $99$ inclusive. Print the same
list sorted in non-decreasing order. Because every value fits in the small range $0$ to
$99$, one way is to count how many times each value occurs and then write each value out
that many times, but any method that prints the correctly sorted list is accepted.

## Input

The first line contains one integer $n$, the number of values.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$.

## Output

Print one line containing all $n$ values in non-decreasing order, separated by single
spaces. A value that occurs $k$ times in the input must appear exactly $k$ times in the
output.

## Constraints

- $1 \le n \le 10^6$
- $0 \le a_i \le 99$

## Example

**Example 1**

Input:
```
8
63 25 73 1 98 73 56 84
```
Output:
```
1 25 56 63 73 73 84 98
```

The smallest value in the list is $1$ and the largest is $98$, so the output starts with
$1$ and ends with $98$. The value $73$ occurs twice in the input, so it is printed twice,
back to back, between $63$ and $84$. Every other value occurs once.

**Example 2**

Input:
```
6
5 0 99 5 0 5
```
Output:
```
0 0 5 5 5 99
```

Counting occurrences: $0$ appears twice, $5$ appears three times, and $99$ appears once.
Writing each value out as many times as it was counted, in increasing order of value,
gives two $0$s, then three $5$s, then one $99$.
