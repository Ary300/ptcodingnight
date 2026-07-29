# Jumping on the Clouds

The Park Tudor robotics team hung the Coding Night banner from the catwalk above the gym, and now somebody has to walk out there and take it down. The catwalk is a straight line of numbered panels, and the facilities crew has put red tape over the panels that are not rated to hold a person. You start on panel $1$, you have to reach the last panel, and because you are wearing a backpack full of extension cords you can only step forward onto the next panel or hop forward over exactly one panel. Landing on a taped panel is not an option. Find the fewest moves that get you to the end.

## Input

The first line contains a single integer $n$, the number of panels.

The second line contains $n$ integers $p_1, p_2, \dots, p_n$ separated by spaces. $p_i$ is $0$ if panel $i$ is safe and $1$ if panel $i$ is taped off.

## Output

Print a single integer: the minimum number of moves needed to travel from panel $1$ to panel $n$. Each move goes from panel $i$ to panel $i+1$ or to panel $i+2$, and every panel you land on must be safe.

## Constraints

- $2 \le n \le 200000$
- $p_i \in \{0, 1\}$ for every $i$
- $p_1 = 0$ and $p_n = 0$ (the two ends are always safe)
- No two taped panels are adjacent, so the walk is always possible

## Example

**Input**

```
7
0 0 1 0 0 1 0
```

**Output**

```
4
```

Panels $3$ and $6$ are taped. One optimal route is $1 \to 2 \to 4 \to 5 \to 7$, which is four moves; the hop from $5$ to $7$ clears the taped panel $6$. No three-move route exists, because three moves cover at most six panels of distance and the end is six panels away only if every move is a hop — but that route would land on panel $3$.

**Input**

```
4
0 1 0 0
```

**Output**

```
2
```

Panel $2$ is taped, so the only way off the start is the hop $1 \to 3$, then a single step $3 \to 4$.
