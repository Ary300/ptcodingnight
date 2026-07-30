package main

import "fmt"

// An unused variable is a compile ERROR in Go, not a warning. Good CE fixture: the mistake is
// idiomatic to the language rather than a generic syntax error.
func main() {
	unused := 42
	fmt.Println("hi")
}
