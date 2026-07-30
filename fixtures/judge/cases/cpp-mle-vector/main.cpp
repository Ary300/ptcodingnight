// Touches every page. Reserving address space is not an allocation the kernel will OOM-kill;
// a fixture that only reserves reports TLE and tests nothing.
#include <vector>
#include <cstdio>
int main() {
    std::vector<std::vector<char>> held;
    while (true) {
        held.emplace_back(64u * 1024u * 1024u);
        for (size_t i = 0; i < held.back().size(); i += 4096) held.back()[i] = 1;
        std::fputc('.', stderr);
    }
    return 0;
}
