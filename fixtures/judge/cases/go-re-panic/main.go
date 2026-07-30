package main

import (
	"bufio"
	"fmt"
	"os"
)

// A panic exits 2 — RE. This compiles cleanly, so it is not a CE.
func main() {
	r := bufio.NewReader(os.Stdin)
	var a, b int64
	fmt.Fscan(r, &a, &b)
	panic("deliberate")
}
