# Cut the sticks

The Park Tudor robotics team dumped a bin of aluminum rods onto the shop table, and nobody
can agree on what to build. Their band saw is old and stubborn: it can only be set to one
depth, so every pass shortens *every* rod on the table by the same amount. To waste as
little metal as possible, the team always sets the saw to the length of the shortest rod
still on the table, runs one pass over all of them, and sweeps the rods that vanished to
nothing into the scrap bucket. They repeat this until the table is empty. Your job is to
report how busy the saw was on each pass.

## Input

The first line contains one integer $n$, the number of rods.
The second line contains $n$ space-separated integers $a_1, a_2, \dots, a_n$, the rod
lengths in millimetres.

## Output

Before each saw pass, print the number of rods currently on the table, one number per line,
in order. Stop when the table is empty. Note that a rod whose length becomes $0$ is swept
away and is not counted on later passes.

## Constraints

- $1 \le n \le 200000$
- $1 \le a_i \le 10^9$

## Example

**Example 1**

Input:
```
6
5 4 4 2 2 8
```
Output:
```
6
4
2
1
```

All 6 rods start on the table, so 6 is printed; the shortest is 2, so one pass leaves
lengths 3, 2, 2, 0, 0, 6 and two rods are scrapped. Four rods remain, and after cutting 2
more only 1 and 4 survive. Printing 2 and then cutting 1 leaves a single rod of length 3,
so 1 is printed and the last pass clears the table.

**Example 2**

Input:
```
3
7 7 7
```
Output:
```
3
```

The three rods are all the same length, so the first pass reduces every one of them to
zero and the table is empty after a single line of output.
