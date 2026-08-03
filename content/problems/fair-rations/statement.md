# Fair Rations

Park Tudor's campus sits on the former Lilly family apple orchard, and the cider store
near the front drive still sells cider donuts by the box. At the break between sets B and
C of Coding Night, Mr. Ritz carries a tray of them down the row of tables where the teams
are seated. Some students already grabbed donuts earlier, and club tradition holds that
nobody leaves the break with an odd number of them. The tray has a rule of its own:
donuts come off it two at a time, and the two donuts from a single handoff always go to
two students sitting directly beside each other. Mr. Ritz wants to honor the tradition
with as few donuts as possible, and Kylie has volunteered her team's laptop to work out
whether it can be done at all.

There are $n$ people in a line, numbered $1$ through $n$ from left to right, and person
$i$ currently holds $B_i$ donuts. In one handoff you choose two adjacent people
(positions $i$ and $i + 1$) and give one donut to each of them, so every handoff
distributes exactly two donuts. Determine the minimum total number of donuts that must be
handed out so that every person ends up holding an even number, or report that no
sequence of handoffs can achieve this.

## Input

The first line contains one integer $n$, the number of people in the line.
The second line contains $n$ space-separated integers $B_1, B_2, \dots, B_n$, where
$B_i$ is the number of donuts person $i$ starts with.

## Output

Print a single integer: the minimum total number of donuts handed out so that every
person holds an even number. If no sequence of handoffs can make every count even, print
`NO` instead.

## Constraints

- $1 \le n \le 10^5$
- $1 \le B_i \le 1000$

## Example

**Example 1**

Input:
```
5
4 5 6 7 4
```
Output:
```
4
```

Persons $2$ and $4$ start with odd counts. Hand one donut each to persons $2$ and $3$,
giving counts $4\ 6\ 7\ 7\ 4$, then one each to persons $3$ and $4$, giving
$4\ 6\ 8\ 8\ 4$. Every count is now even after $4$ donuts, and no cheaper sequence
exists: each of the two odd counts needs at least one more donut, and donuts only leave
the tray in pairs.

**Example 2**

Input:
```
3
2 3 4
```
Output:
```
NO
```

The total starts at $2 + 3 + 4 = 9$, which is odd, and every handoff raises the total by
exactly $2$, so the total stays odd forever. A line in which every count is even has an
even total, so no sequence of handoffs works.
