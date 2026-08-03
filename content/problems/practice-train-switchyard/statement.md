# The Coding Night Switchyard

Between scored sets at Coding Night, the train tracks table runs a standing puzzle.
Navraj lays a straight inbound track and a straight outbound track through a single
junction, with one dead-end siding branching off between them, and parks $n$ wooden
cars, numbered $1$ through $n$, on the inbound track in a scrambled order. Mr. Ritz
would like the cars to leave in numeric order for the closing demonstration, and Kylie
is convinced that even when perfect order is out of reach, careful use of the siding
still gets the departure order close.

The cars reach the junction one at a time, in the given arrival order, and no car ever
moves backward. When a car reaches the junction, exactly one of two things happens: it
rolls straight through onto the outbound track and departs immediately, or it is pushed
into the siding. The siding is a dead end, so cars leave it in the reverse of the order
they entered: at any moment the only car that may move from the siding onto the
outbound track is the one most recently pushed, and it departs the moment it does.
Every car must eventually depart. Decide whether the departure order $1, 2, \dots, n$
is achievable, and find the lexicographically smallest departure order the yard can
achieve. A sequence $x$ is lexicographically smaller than a sequence $y$ if, at the
first position where they differ, $x$ holds the smaller number.

## Input

The first line contains one integer $n$, the number of cars.
The second line contains $n$ space-separated integers $c_1, c_2, \dots, c_n$, a
permutation of $1$ through $n$, where $c_1$ reaches the junction first.

## Output

Print two lines.
On the first line, print `ON TIME` if the cars can depart in the order
$1, 2, \dots, n$, and `DELAYED` otherwise.
On the second line, print $n$ space-separated integers: the lexicographically smallest
departure order the yard can achieve.

## Constraints

- $1 \le n \le 200000$
- $c_1, c_2, \dots, c_n$ is a permutation of $1, 2, \dots, n$

## Example

**Example 1**

Input:
```
4
2 4 1 3
```
Output:
```
DELAYED
1 3 4 2
```

Push car $2$ into the siding, then car $4$ on top of it. Car $1$ rolls straight through
and departs first. Car $2$ is now buried under car $4$, so the second departure must be
either car $4$ from the siding or car $3$ from the inbound track, and car $3$ is the
smaller choice. The siding then empties in reverse order: car $4$, then car $2$. No
plan can begin $1, 2$, because any plan that sends car $1$ out first leaves car $4$
sitting between the junction and car $2$. The best achievable order is $1, 3, 4, 2$.

**Example 2**

Input:
```
4
3 2 1 4
```
Output:
```
ON TIME
1 2 3 4
```

Cars $3$ and $2$ go into the siding, car $1$ rolls straight through, the siding then
releases car $2$ and car $3$ in that order, and finally car $4$ rolls straight through.
The cars leave in exact numeric order, so the smallest achievable order is
$1, 2, 3, 4$ and the yard runs on time.
