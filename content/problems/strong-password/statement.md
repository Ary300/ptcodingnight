# Strong Password

Every team at Coding Night gets one shared account on the contest platform, and Mr. Ritz
sets the password policy before the first set opens. He learned to. Last year a team
picked the name of the cider store as their password, and a neighboring table guessed it
before set A was graded. This year the platform refuses any password that is too short or
too plain, and Kylie wants to know, for the password her team already agreed on, the
smallest number of extra characters they have to tack onto it before the sign-in form will
accept it.

You are given a password string $s$. A password is **strong** when all five conditions
hold: its length is at least $6$, it contains at least one digit (`0`-`9`), at least one
lowercase English letter (`a`-`z`), at least one uppercase English letter (`A`-`Z`), and
at least one special character from the set `!@#$%^&*()-+` (exactly those twelve
characters). You may append characters of your choice, one at a time, anywhere in the
string, and each appended character may be any digit, letter, or special character from
that set. Print the minimum number of characters that must be added to $s$ to make it
strong. If $s$ is already strong, the answer is $0$.

## Input

A single line containing the password $s$. It has no spaces and consists only of digits,
lowercase English letters, uppercase English letters, and special characters from the set
`!@#$%^&*()-+`.

## Output

Print a single integer: the minimum number of characters to add so that the password is
strong.

## Constraints

- $1 \le |s| \le 100$

## Example

**Example 1**

Input:
```
PT1902
```
Output:
```
2
```

The length is already $6$, and the password contains uppercase letters (`P`, `T`) and
digits (`1`, `9`, `0`, `2`). It is missing a lowercase letter and a special character,
which are two separate requirements, and one added character can satisfy only one of
them. Adding two characters, for example `a` and `!`, makes it strong, so the answer is
$2$.

**Example 2**

Input:
```
cider
```
Output:
```
3
```

`cider` has length $5$, so at least $6 - 5 = 1$ character must be added for length alone.
But it is missing three character classes: a digit, an uppercase letter, and a special
character. Three added characters, say `7`, `C`, and `#`, fix all three classes and bring
the length to $8 \ge 6$ at the same time. No two characters can cover three missing
classes, so the answer is $3$.

**Example 3**

Input:
```
Ab1!
```
Output:
```
2
```

All four character classes are already present, but the length is $4$. The only thing
missing is length, so $6 - 4 = 2$ characters of any allowed kind must be added, and the
answer is $2$.
