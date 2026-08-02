# sWAP cASE

The Tribune lays out its pages in the publications room in Foster Hall, and the headline
style is strict: every letter's case matters, because the print template renders capitals
in a heavier cut. Late on a production night, Kylie discovered that an entire batch of
headlines had been typed with caps lock inverted, so every capital came out lowercase and
every lowercase letter came out capital. The dates, scores, and punctuation are fine, only
the letters are backwards, and retyping them by hand before the print deadline is not
going to happen.

Given a single line of text, toggle the case of every letter in it: each uppercase letter
becomes the corresponding lowercase letter, and each lowercase letter becomes the
corresponding uppercase letter. Every character that is not a letter (digits, spaces,
punctuation, symbols) stays exactly as it is, in its original position.

## Input

A single line containing the string $s$. The line may contain spaces.

## Output

Print one line: the string $s$ with the case of every letter toggled and every other
character unchanged.

## Constraints

- $1 \le |s| \le 10^4$
- Every character of $s$ is printable ASCII (character codes $32$ to $126$).
- The first and last characters of $s$ are not spaces.
- Letters are the ASCII letters `a`..`z` and `A`..`Z` only.

## Example

**Example 1**

Input:
```
pANTHERS wIN 16-3
```
Output:
```
Panthers Win 16-3
```

In `pANTHERS`, the lowercase `p` becomes `P` and the uppercase `ANTHERS` becomes
`anthers`, giving `Panthers`; the same happens to `wIN`. The digits `16`, the hyphen, and
both spaces are not letters, so `16-3` is printed exactly as it appeared.

**Example 2**

Input:
```
tHE tRIBUNE, est. 1902
```
Output:
```
The Tribune, EST. 1902
```

The toggling runs in both directions at once: `tHE` becomes `The` and `tRIBUNE` becomes
`Tribune` (uppercase to lowercase for all but the first letter), while the fully lowercase
`est` becomes the fully uppercase `EST`. The comma, the period, the spaces, and the year
`1902` are unchanged.
