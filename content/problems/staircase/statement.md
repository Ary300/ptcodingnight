# Staircase

The stage crew for the middle school musical is building a stepped riser at the back of
Ayres Auditorium, and Mr. Ritz wants a build diagram taped to the scene shop door before
anyone picks up a saw. Kylie draws it the way the crew reads it from the house: each step
is a stack of unit blocks, the whole thing leans against the stage-right wall, so every
row of blocks is pushed as far right as the diagram allows. Her printer only has one
symbol that reads clearly from across the shop, the # character, and the blank space in
front of each row matters just as much as the blocks, because that is what tells the crew
where each course of blocks starts.

Given an integer $n$, print a staircase of height $n$ made of # characters. Row $i$
(counting from $1$ at the top) contains exactly $i$ # characters, right-aligned in a
field of width $n$: that is, $n - i$ space characters followed by $i$ # characters. The
leading spaces are part of the answer and are checked. Do not print any spaces after the
last # on a line.

## Input

A single line containing one integer $n$, the height of the staircase.

## Output

Print $n$ lines. Line $i$ consists of $n - i$ space characters followed by $i$ #
characters, so the bottom line is $n$ # characters with no spaces at all.

## Constraints

- $1 \le n \le 100$

## Example

**Example 1**

Input:
```
4
```
Output:
```
   #
  ##
 ###
####
```

The staircase has height $4$, so every line is $4$ characters wide. Line $1$ is $3$
spaces then $1$ #; line $2$ is $2$ spaces then $2$ #; line $3$ is $1$ space then
$3$ #; line $4$ is $0$ spaces then $4$ #.

**Example 2**

Input:
```
6
```
Output:
```
     #
    ##
   ###
  ####
 #####
######
```

With $n = 6$ the top line carries $6 - 1 = 5$ leading spaces before its single #, and
each following line trades one space for one more #, until the sixth line is six #
characters flush against the left edge.
