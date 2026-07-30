// volatile so -O2 cannot delete the loop. Without it the compiler proves the loop has no
// effect, removes it, and the fixture becomes a WA instead of the TLE it is testing.
#include <cstdio>
int main() {
    volatile long long x = 0;
    while (true) { x = x + 1; }
    return 0;
}
