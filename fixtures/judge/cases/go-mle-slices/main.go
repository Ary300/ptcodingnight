package main

import "os"

// Writes to every page. make() alone gives zeroed pages the kernel may not have faulted in,
// which would report TLE rather than the MLE this case exists to prove.
func main() {
	held := make([][]byte, 0)
	for {
		b := make([]byte, 64*1024*1024)
		for i := 0; i < len(b); i += 4096 {
			b[i] = 1
		}
		held = append(held, b)
		os.Stderr.WriteString(".")
	}
}
