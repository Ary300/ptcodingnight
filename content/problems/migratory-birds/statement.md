# Migratory Birds

Every autumn the Park Tudor eco club straps a motion-triggered camera to the sycamore
behind the upper school pond and lets it run for the whole migration season. A volunteer
watches the footage and writes down a species code for each bird that lands, one code per
sighting, in the order the camera caught them. At the end of the season the club prints a
poster of the season's most-sighted species, and they need the winner before the banquet
starts. Two species can absolutely tie, so the club settled the argument years ago: the
species with the smaller code wins the poster.

## Input

The first line contains one integer $n$, the number of sightings in the log.
The second line contains $n$ space-separated integers $s_1, s_2, \dots, s_n$, where $s_i$
is the species code of the $i$-th sighting.

## Output

Print a single integer: the species code that appears most often in the log. If several
species are tied for the most sightings, print the smallest such code.

## Constraints

- $1 \le n \le 200000$
- $1 \le s_i \le 50$

## Example

**Example 1**

Input:
```
7
3 1 4 1 3 1 4
```
Output:
```
1
```

Species $1$ was logged three times, species $3$ and $4$ twice each, so $1$ wins outright.

**Example 2**

Input:
```
6
5 2 5 2 4 4
```
Output:
```
2
```

Here species $2$, $4$, and $5$ each appear twice. Nothing separates them by count, so the
tie-break applies and the smallest of the three codes, $2$, gets the poster.
