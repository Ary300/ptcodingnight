# Bigger is Greater

Between judged sets at Coding Night, Kylie runs the letter-tile table next to the metal
puzzle and the train tracks. A team hands her a word spelled out in tiles, and the
challenge is fixed: rearrange exactly those tiles, no more and no fewer, into a word that
comes later in the dictionary. To keep the scoring fair across teams, Mr. Ritz added one
rule when he wrote the station card: of all the later words a team could build, only the
earliest one counts. Some words, Kylie warns every team, cannot be beaten at all.

You are given $t$ words. For each word $w$, find the lexicographically smallest string
that uses exactly the same letters as $w$ (each letter the same number of times) and is
lexicographically strictly greater than $w$. If no rearrangement of $w$ is strictly
greater than $w$, report that there is no answer.

## Input

The first line contains one integer $t$, the number of words.
Each of the next $t$ lines contains one word $w$ made of lowercase English letters.

## Output

Print $t$ lines. On the $i$-th line print the lexicographically smallest rearrangement of
the $i$-th word that is strictly greater than it, or the exact text `no answer` if the
word has no such rearrangement.

## Constraints

- $1 \le t \le 10^5$
- $1 \le |w| \le 100$
- The total length of all words in one input is at most $10^6$.
- Every word consists only of the lowercase letters `a` through `z`.

## Example

**Example 1**

Input:
```
3
ab
bb
panther
```
Output:
```
ba
no answer
panthre
```

The word `ab` has exactly one other arrangement, `ba`, and it is greater, so it is the
answer. The word `bb` has no other arrangement at all, so nothing can beat it. For
`panther`, keeping the prefix `panth` and swapping the last two letters gives `panthre`,
which is greater than `panther`. Any arrangement that changes one of the first five
letters and still beats `panther` must place a larger letter earlier, which makes it
larger than `panthre` as well, so `panthre` is the answer.

**Example 2**

Input:
```
2
tudor
zyx
```
Output:
```
tudro
no answer
```

For `tudor`, keeping the prefix `tud` leaves the letters `o` and `r` for the last two
positions: `or` gives `tudor` itself and `ro` gives `tudro`, which is the smallest
arrangement greater than `tudor`. The word `zyx` is already the greatest possible
arrangement of its three letters, since they appear in strictly decreasing order, so the
answer is `no answer`.
