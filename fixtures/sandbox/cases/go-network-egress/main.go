package main

import (
	"fmt"
	"net"
	"os"
)

// --network=none leaves no interface at all, so this cannot resolve or connect.
func main() {
	c, err := net.Dial("tcp", "1.1.1.1:80")
	if err != nil {
		fmt.Fprintln(os.Stderr, "dial failed:", err)
		os.Exit(1)
	}
	c.Close()
	fmt.Println("CONNECTED")
}
