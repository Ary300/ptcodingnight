// Raw BSD sockets — the lowest-level reach of any runtime here, and the one that would
// notice first if --network=none were not actually applied.
#include <arpa/inet.h>
#include <sys/socket.h>
#include <unistd.h>
#include <cstdio>
#include <cstring>

int main() {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) { fprintf(stderr, "socket() failed\n"); return 1; }
    sockaddr_in a{};
    a.sin_family = AF_INET;
    a.sin_port = htons(80);
    inet_pton(AF_INET, "1.1.1.1", &a.sin_addr);
    if (connect(fd, reinterpret_cast<sockaddr*>(&a), sizeof(a)) != 0) {
        fprintf(stderr, "connect() failed\n");
        close(fd);
        return 1;
    }
    printf("CONNECTED\n");
    close(fd);
    return 0;
}
