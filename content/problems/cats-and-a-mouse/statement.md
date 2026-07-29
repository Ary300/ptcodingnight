# Cats and a Mouse

The robotics shop has two resident cats, Pixel and Byte, who nap on the workbench until
somebody's wind-up toy mouse skitters down the long strip of measuring tape taped to the
hallway floor. Both cats launch at exactly the same instant and sprint at exactly the same
speed, so whichever cat starts closer to the mouse gets there first. If they are the same
distance away, they collide in a cloud of fur and the mouse rattles off to safety.

## Input

The first line contains one integer $q$, the number of chases to simulate.

Each of the next $q$ lines contains three space-separated integers $p$, $b$, and $m$: the
mark on the tape where Pixel starts, the mark where Byte starts, and the mark where the toy
mouse is sitting. The mouse does not move.

## Output

Print $q$ lines, one per chase, in the order the chases were given.

Print `PIXEL` if Pixel reaches the mouse first, `BYTE` if Byte reaches it first, and `SAFE`
if both cats arrive at the same moment.

## Constraints

- $1 \le q \le 20000$
- $-10^9 \le p \le 10^9$
- $-10^9 \le b \le 10^9$
- $-10^9 \le m \le 10^9$
- The three marks in a line may coincide.

## Example

Input:

```
3
2 9 5
-4 4 0
7 7 7
```

Output:

```
PIXEL
SAFE
SAFE
```

In the first chase Pixel must cover $|2 - 5| = 3$ marks while Byte must cover
$|9 - 5| = 4$, so Pixel wins. In the second chase both cats are $4$ marks away, so they tie
and the mouse escapes. In the third chase both cats are already sitting on the mouse's
mark; distance $0$ for each is still a tie, so print `SAFE`.

A second sample uses a single chase at the extreme ends of the tape:

Input:

```
1
-1000000000 1000000000 999999999
```

Output:

```
BYTE
```

Byte is only $1$ mark away, while Pixel is nearly the whole tape away.
