# Panther Palindrome Pairs

For spirit week the yearbook staff printed every Panther a name tag with a short nickname
on it, all lowercase, no spaces. Someone noticed that two of the tags in the pile read as
each other backwards, and now the staff wants to know how often that happens across the
whole school.

Two tags form a **mirror pair** when the second tag is the first tag spelled backwards. The
tag `pawt` mirrors `twap`. A tag that reads the same forwards and backwards, like `noon`,
mirrors any other tag that says `noon`. Each tag is a separate physical object, so two
identical tags are two different tags even though they say the same thing.

Count the mirror pairs in the pile. A pair is a set of two different tags, so the order of
the two tags does not matter and no tag is paired with itself.

## Input

The first line contains an integer $n$, the number of tags.

The second line contains $n$ tags separated by spaces. Each tag is a non-empty string of
lowercase English letters.

## Output

Print one integer: the number of mirror pairs in the pile.

## Constraints

- $1 \le n \le 1000$
- Each tag has between $1$ and $10$ lowercase letters.

## Example

Sample 1 input:

```
6
pawt twap noon paw noon wapt
```

Sample 1 output:

```
2
```

`pawt` spelled backwards is `twap`, so the first and second tags are a mirror pair. The two
`noon` tags are a mirror pair, because `noon` backwards is `noon`. `paw` backwards is `wap`
and `wapt` backwards is `tpaw`, and neither of those is in the pile.

Sample 2 input:

```
5
aa aa aa ab ba
```

Sample 2 output:

```
4
```

Any two of the three `aa` tags are a mirror pair, which gives three pairs. `ab` and `ba`
make the fourth. A tag is never paired with itself, so a single `aa` on its own would count
for nothing.
