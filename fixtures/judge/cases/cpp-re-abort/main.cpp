// Non-zero exit through an uncaught exception — RE, not CE: this compiles cleanly.
#include <stdexcept>
#include <iostream>
int main() {
    long long a, b;
    std::cin >> a >> b;
    throw std::runtime_error("deliberate");
}
