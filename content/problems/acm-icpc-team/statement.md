# ACM ICPC Team

Registration for Coding Night closes Friday, and Mr. Ritz has one job left before he can
post the team list outside Foster Hall: pairing people up. Every student who signed up
filled out the same checklist of practice topics, everything the sets A through D have
ever drawn on, marking each topic they feel ready for. A pair is only as strong as its
combined checklist: if Kylie has dynamic programming covered and Gavin has geometry, the
pair has both. Mr. Ritz wants to know how good the best possible pairing is, and, since
he would rather not be accused of favoritism in The Tribune, how many different pairs are
tied at that level.

You are given the checklists of $n$ students over $m$ topics. Each checklist is a string
of $m$ characters, where character $j$ is `1` if the student knows topic $j$ and `0`
otherwise. A pair of two distinct students knows a topic if at least one of the two knows
it. Over all $\binom{n}{2}$ unordered pairs, determine the maximum number of topics any
pair knows, and how many pairs know that many topics.

## Input

The first line contains two space-separated integers $n$ and $m$, the number of students
and the number of topics.
Each of the next $n$ lines contains a string of exactly $m$ characters, each `0` or `1`:
the checklist of one student.

## Output

Print two lines. The first line contains a single integer: the maximum number of topics
known by any pair of students. The second line contains a single integer: the number of
unordered pairs that know that maximum number of topics.

## Constraints

- $2 \le n \le 500$
- $1 \le m \le 500$
- Each checklist has exactly $m$ characters, and every character is `0` or `1`.

## Example

**Example 1**

Input:
```
4 5
10101
11100
11010
00101
```
Output:
```
5
2
```

There are six pairs. Students $1$ and $3$ combine `10101` with `11010` to cover
`11111`, all $5$ topics; students $3$ and $4$ combine `11010` with `00101` and also
cover all $5$. No other pair reaches $5$ (for instance, students $1$ and $2$ cover
`11101`, which is $4$ topics), so the answers are $5$ and $2$.

**Example 2**

Input:
```
3 4
1000
1000
1000
```
Output:
```
1
3
```

Every student knows only topic $1$, so every pair covers exactly `1000`: $1$ topic. All
$\binom{3}{2} = 3$ pairs are tied at that maximum, so the answers are $1$ and $3$.
