# Time Conversion

Coding Night runs on two clocks. The printed schedule taped to the door of the Ruth Lilly
Science Center lists everything the way the front office writes it: doors at 05:30:00PM,
set B opens at 07:15:00PM, the metal puzzle table closes at 09:00:00PM. The countdown
display Mr. Ritz drives from the projector booth accepts only 24-hour times, and he is not
going to convert forty schedule entries by hand while teams are lining up in the hallway.
He wants a program: paste in one 12-hour time, get back the 24-hour form the display
understands.

Given a time of day in 12-hour clock notation, convert it to 24-hour clock notation. In
12-hour notation the hour runs from $01$ to $12$ and carries an `AM` or `PM` suffix:
`12:00:00AM` is midnight and `12:00:00PM` is noon. In 24-hour notation the hour runs from
$00$ to $23$ with no suffix, so midnight is `00:00:00` and noon is `12:00:00`.

## Input

A single line containing a time in the exact format `hh:mm:ssAM` or `hh:mm:ssPM`, where
`hh`, `mm`, and `ss` are each two digits.

## Output

Print the same time of day in the format `hh:mm:ss` on a 24-hour clock, with each of the
three fields printed as exactly two digits.

## Constraints

- $01 \le hh \le 12$
- $00 \le mm \le 59$
- $00 \le ss \le 59$
- The suffix is exactly `AM` or `PM`, uppercase, with no space before it.

## Example

**Example 1**

Input:
```
07:05:45PM
```
Output:
```
19:05:45
```

The suffix is `PM` and the hour is not $12$, so add $12$ to the hour: $7 + 12 = 19$. The
minutes and seconds are unchanged.

**Example 2**

Input:
```
12:00:00AM
```
Output:
```
00:00:00
```

`12:00:00AM` is midnight. Hour $12$ with an `AM` suffix becomes hour $00$ on the 24-hour
clock, so nothing is added and the $12$ is replaced by $00$.

**Example 3**

Input:
```
12:00:00PM
```
Output:
```
12:00:00
```

`12:00:00PM` is noon. Hour $12$ with a `PM` suffix stays $12$: adding $12$ here would
produce hour $24$, which does not exist on a 24-hour clock.
