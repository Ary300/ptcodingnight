#include <cstdio>

int main() {
    FILE* f = std::fopen("/etc/ptcn-owned", "w");
    if (f == nullptr) { std::fprintf(stderr, "fopen failed\n"); return 1; }
    std::fputs("x", f);
    std::fclose(f);
    std::printf("WROTE\n");
    return 0;
}
