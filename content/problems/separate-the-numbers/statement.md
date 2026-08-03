# Separate the Numbers

The cider store on the Park Tudor campus is a holdover from the property's days as the
Lilly family apple orchard, and it still stamps every crate in a shipment with a lot
number. Lot numbers within one shipment are consecutive: each crate carries a number
exactly one more than the crate before it, and a shipment always has at least two crates.
The stamping machine also prints the whole shipment's numbers onto a single strip of
receipt tape, in order, with no spaces between them. Mr. Ritz, sorting the fall delivery
for the Coding Night snack table, has a drawer of loose tapes, some genuine and some
mangled by a paper jam, and he wants to know which tapes could really have come out of
the machine, and what lot number those shipments started at.

You are given a string $s$ of decimal digits. Decide whether $s$ can be split into two or
more substrings such that, reading left to right, each substring is the decimal
representation of a positive integer with no leading zeros, and each integer after the
first is exactly one more than the integer before it. If such a split exists, report the
first integer of the split; if more than one split works, report the smallest possible
first integer.

## Input

A single line containing the digit string $s$.

## Output

If a valid split exists, print `YES`, a single space, and the first integer of the split
(the smallest such integer if several splits are valid). Otherwise print `NO`.

## Constraints

- $1 \le |s| \le 32$
- $s$ consists only of the characters `0` through `9`
- In any valid split the first integer has at most $16$ digits, so every number involved
  fits in a signed 64-bit integer

## Example

**Example 1**

Input:
```
1234
```
Output:
```
YES 1
```

Cutting after every digit gives the sequence $1, 2, 3, 4$, and each number is one more
than the one before it, so the tape is genuine and the shipment started at lot $1$. Note
that taking $12$ as the first number fails: the rest of the tape would have to start
with $13$, but it reads $34$.

**Example 2**

Input:
```
99100
```
Output:
```
YES 99
```

Taking the first number to be $9$ fails, because the tape would have to continue with
$10$ and instead it continues with $91$. Taking the first two digits as $99$ works: the
remainder is exactly $100$, which is $99 + 1$, so the answer is `YES 99`.

**Example 3**

Input:
```
13
```
Output:
```
NO
```

The only way to cut this tape into two or more numbers is $1$ followed by $3$, and $3$ is
not $1 + 1$. Leaving the tape whole as the single number $13$ is not allowed, because a
shipment always has at least two crates.
