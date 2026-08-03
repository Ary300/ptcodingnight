"""Running Time of Algorithms -- reference solution.

The number of shifts insertion sort performs equals the number of pairs
(i, j) with i < j and a[i] > a[j]. Count those pairs with a merge sort,
O(n log n), deliberately a different approach from the brute-force
simulation so the two can check each other.
"""

import sys


def count_and_sort(values: list[int]) -> tuple[list[int], int]:
    if len(values) <= 1:
        return values, 0
    mid = len(values) // 2
    left, left_count = count_and_sort(values[:mid])
    right, right_count = count_and_sort(values[mid:])

    merged: list[int] = []
    count = left_count + right_count
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            merged.append(left[i])
            i += 1
        else:
            # left[i] > right[j]: right[j] is smaller than everything
            # remaining in left, so it forms an inversion with each.
            merged.append(right[j])
            j += 1
            count += len(left) - i
    merged.extend(left[i:])
    merged.extend(right[j:])
    return merged, count


def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]
    _, shifts = count_and_sort(a)
    print(shifts)


if __name__ == "__main__":
    main()
