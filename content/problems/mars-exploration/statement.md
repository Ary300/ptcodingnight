# Mars Exploration

For this year's Coding Night, Panther Robotics parked their practice rover at the far
edge of campus, out past the cider store on what used to be the Lilly family apple
orchard, and pointed its little radio at a base station on the roof of the Ruth Lilly
Science Center. The rover does exactly one thing: it transmits the distress string
`SOS` over and over until someone drives out and retrieves it. Mr. Ritz, who is
supervising the base station, noticed that the received transcript does not quite match
what the rover sent. Sixty-eight acres of trees and one aging antenna will do that. He
handed the transcript to Kylie and asked for a single number: how bad is the link?

You are given the received message. The rover transmitted the string `SOS` repeated
some whole number of times, so the original message had length equal to a multiple of
$3$. Interference may have changed some characters to other uppercase letters, but no
characters were added, removed, or reordered: the received message has exactly the same
length as the original. Count how many positions in the received message differ from
the original repeated `SOS` pattern.

## Input

A single line containing the received message $m$, a string of uppercase English
letters.

## Output

Print a single integer: the number of characters in $m$ that differ from the repeated
`SOS` pattern.

## Constraints

- $3 \le |m| \le 10^5$
- $|m|$ is a multiple of $3$
- $m$ consists only of uppercase English letters (`A` to `Z`)

## Example

**Example 1**

Input:
```
SOSSPSSQSSOR
```
Output:
```
3
```

The rover sent four copies of `SOS`, so the original message was `SOSSOSSOSSOS`.
Comparing block by block: `SOS` matches, `SPS` has one wrong character (`P` should be
`O`), `SQS` has one (`Q` should be `O`), and `SOR` has one (`R` should be `S`). In
total $1 + 1 + 1 = 3$ characters were altered.

**Example 2**

Input:
```
SOSSOS
```
Output:
```
0
```

Both blocks arrived exactly as sent, so $0$ characters were altered.
