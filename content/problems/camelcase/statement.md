# CamelCase

Panther Robotics keeps its entire drivetrain codebase in one shared repository, and Mr.
Ritz runs the style check before every competition build. The team's naming rule is
strict camelCase: a variable name starts with a lowercase word, and every word after the
first is glued on with its first letter capitalized, like `irsayFamilySportsCenter` or
`ciderStoreInventory`. During code review Mr. Ritz likes to ask how many words are packed
into a name, because names that hoard six or seven words usually mean somebody was
avoiding writing a comment. Counting by eye works until the name is forty characters
long, so the reviewers want a program that does it for them.

You are given a single variable name written in camelCase: it begins with a lowercase
English letter, contains only English letters, and every uppercase letter marks the start
of a new word. Count the number of words in the name.

## Input

A single line containing the string $s$, the variable name.

## Output

Print a single integer: the number of words in $s$.

## Constraints

- $1 \le |s| \le 10^5$
- $s$ consists only of English letters (`a`-`z` and `A`-`Z`)
- The first character of $s$ is a lowercase letter

## Example

**Example 1**

Input:
```
irsayFamilySportsCenter
```
Output:
```
4
```

The name splits into `irsay`, `Family`, `Sports`, and `Center`. There are $3$ uppercase
letters, each one starting a new word after the first, so the total is $3 + 1 = 4$ words.

**Example 2**

Input:
```
cider
```
Output:
```
1
```

There are no uppercase letters at all, so the whole string is one single word, and the
answer is $0 + 1 = 1$.
