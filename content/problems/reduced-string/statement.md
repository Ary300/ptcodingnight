# Super Reduced String

The cider store on Park Tudor's campus still sells apples grown on the 68 acres that were
once the Lilly family orchard, and every lot that arrives gets a crate stamped with a
single lowercase letter for its variety. The crates stand in one long row behind the
counter. Mr. Ritz, who supervises the store's student staff, has a standing rule for
Kylie's closing shift: whenever two crates with the same letter sit directly next to each
other, they go out front as a two-pack, and the crates on either side slide together to
close the gap. Kylie repeats this until no two neighboring crates match, then copies the
surviving letters, in order, onto the closing sheet.

You are given a string $s$ of lowercase English letters. A reduction step chooses one pair
of adjacent equal characters and deletes both; the characters that stood on either side of
the deleted pair become adjacent. Reduction steps are applied repeatedly until the string
contains no pair of adjacent equal characters. The final string is the same no matter
which eligible pair is chosen at each step. Compute that final string.

## Input

A single line containing the string $s$.

## Output

Print the fully reduced string on one line. If the reduction deletes every character, so
that the final string is empty, print exactly `Empty String` instead.

## Constraints

- $1 \le |s| \le 10^5$
- $s$ consists only of lowercase English letters, `a` through `z`

## Example

**Example 1**

Input:
```
pantherrr
```
Output:
```
panther
```

The string has $9$ characters and its only adjacent equal pair sits inside the tail
`rrr`. Deleting one pair of `r` characters leaves `panther`, whose $7$ characters contain
no adjacent equal pair, so the reduction stops there.

**Example 2**

Input:
```
abccba
```
Output:
```
Empty String
```

Deleting the pair `cc` from `abccba` leaves `abba`. That brings the two `b` characters
together; deleting `bb` leaves `aa`, and deleting `aa` leaves nothing. All $6$ characters
are gone, so the answer is the phrase `Empty String`.
