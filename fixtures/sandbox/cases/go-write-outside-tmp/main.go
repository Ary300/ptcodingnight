package main

import (
	"fmt"
	"os"
)

// The rootfs is mounted read-only, so this must fail even though the process owns no
// special privileges to lose.
func main() {
	if err := os.WriteFile("/etc/ptcn-owned", []byte("x"), 0o644); err != nil {
		fmt.Fprintln(os.Stderr, "write failed:", err)
		os.Exit(1)
	}
	fmt.Println("WROTE")
}
