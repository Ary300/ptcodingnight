// Representative contest solution, compiled at image-build time purely to populate the
// build cache. `go build std` caches the standard library's own compilation but not the
// link-stage artifacts a real binary needs, which is most of the remaining cost.
//
// The imports are the ones contest solutions actually use. Adding an import here makes
// that package's compilation free for students; it does not make it available to them.
package main

import (
	"bufio"
	"container/heap"
	"fmt"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
)

type ih []int

func (h ih) Len() int            { return len(h) }
func (h ih) Less(i, j int) bool  { return h[i] < h[j] }
func (h ih) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *ih) Push(x any)         { *h = append(*h, x.(int)) }
func (h *ih) Pop() any           { o := *h; n := len(o) - 1; x := o[n]; *h = o[:n]; return x }

func main() {
	r := bufio.NewReader(os.Stdin)
	w := bufio.NewWriter(os.Stdout)
	defer w.Flush()
	var a, b int64
	fmt.Fscan(r, &a, &b)
	xs := []int{3, 1, 2}
	sort.Ints(xs)
	h := &ih{}
	heap.Init(h)
	heap.Push(h, 1)
	fmt.Fprintln(w, a+b, strconv.Itoa(len(xs)), strings.ToUpper("x"), math.Abs(-1.0), heap.Pop(h))
}
