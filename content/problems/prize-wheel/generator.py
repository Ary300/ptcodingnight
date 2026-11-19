import random, subprocess

random.seed(20261118)
cases = [
    (6, [1, 2, 3, 1, 3, 4]),
    (7, [5, 5, 2, 5, 5, 5, 7]),
    (1, [1]),
    (5, [3, 3, 3, 3, 3]),
    (8, [1, 2, 3, 4, 5, 6, 7, 8]),
]
def rnd(n, v):
    return (n, [random.randint(1, v) for _ in range(n)])
cases += [rnd(10, 3), rnd(50, 10), rnd(500, 40), rnd(2000, 2000)]
n = 200000
cases.append(rnd(n, 2))
cases.append((n, list(range(1, n + 1))))
a = [1] * n; a[0] = 2; a[n // 2] = 3; a[n - 1] = 4
cases.append((n, a))
cases.append(rnd(n, 1000))
cases.append(rnd(n, n))
a = [1] * n
for p in random.sample(range(n), 20): a[p] = random.randint(2, 21)
cases.append((n, a))
for i, (n, a) in enumerate(cases, 1):
    inp = f"{n}\n{' '.join(map(str, a))}\n"
    out = subprocess.run(["python3", "reference.py"], input=inp, capture_output=True, text=True, check=True).stdout
    open(f"tests/{i:02d}.in", "w").write(inp)
    open(f"tests/{i:02d}.out", "w").write(out)
print(len(cases), "tests")
