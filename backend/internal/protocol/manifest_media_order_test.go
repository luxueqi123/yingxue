package protocol

import "testing"

func TestManifestMediaOrderPreservesExplicitZeroAndImplicitPositions(t *testing.T) {
	for _, tc := range []struct {
		name   string
		orders []int
		want   []int
	}{
		{"implicit", []int{0, 0, 0}, []int{0, 1, 2}},
		{"explicit-zero-last", []int{1, 2, 0}, []int{1, 2, 0}},
		{"explicit-zero-middle", []int{2, 0, 1}, []int{2, 0, 1}},
		{"equal-first-slots", []int{0, 0, 2}, []int{0, 0, 2}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			refs := make([]MediaReference, len(tc.orders))
			for i, order := range tc.orders {
				refs[i].Order = order
			}
			actual := manifestMediaValues(refs)
			for i, want := range tc.want {
				if got := actual[i].(map[string]any)["order"]; got != want {
					t.Fatalf("slot %d = %v, want %d", i, got, want)
				}
				if refs[i].Order != tc.orders[i] {
					t.Fatal("source references mutated")
				}
			}
		})
	}
}
