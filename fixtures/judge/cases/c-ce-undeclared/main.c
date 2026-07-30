#include <stdio.h>
int main(void) {
    long long a, b;
    scanf("%lld %lld", &a, &b);
    printf("%lld\n", a + c);   /* c was never declared */
    return 0;
}
