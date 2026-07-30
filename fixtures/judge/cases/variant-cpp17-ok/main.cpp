#include <iostream>
#include <utility>

// C++17 only:
//   - structured bindings          (auto [x, y] = ...)
//   - if with initializer          (if (auto v = ...; cond))
//   - constexpr if
std::pair<long long, long long> read() {
    long long a, b;
    std::cin >> a >> b;
    return {a, b};
}

template <typename T>
long long addUp(T a, T b) {
    if constexpr (std::is_integral<T>::value) {
        return a + b;
    } else {
        return 0;
    }
}

int main() {
    auto [a, b] = read();
    if (auto sum = addUp(a, b); true) {
        std::cout << sum << "\n";
    }
    return 0;
}
