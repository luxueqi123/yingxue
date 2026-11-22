package repository

import "testing"

func TestSameJSONDocumentPreservesEventMeaning(t *testing.T) {
	for _, row := range []struct {
		name, left, right string
		equal             bool
	}{
		{"object order", `{"x":1,"y":2}`, `{"y":2,"x":1}`, true},
		{"rounded tool float", `{"x":4140.7990379296753}`, `{"x":4140.799037929675}`, true},
		{"different tool float", `{"x":4140.7990379296753}`, `{"x":4140.799037929676}`, false},
		{"scientific integer", `{"x":1e6}`, `{"x":1000000}`, true},
		{"negative zero", `{"x":-0.0}`, `{"x":0}`, true},
		{"exact large integers", `{"x":9007199254740993}`, `{"x":9007199254740992}`, false},
		{"number is not text", `{"x":1}`, `{"x":"1"}`, false},
		{"nested number is not text", `{"args":[{"x":0.5}]}`, `{"args":[{"x":"0.5"}]}`, false},
		{"changed event field", `{"id":"first","x":1}`, `{"id":"other","x":1}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			if got := sameJSONDocument(row.left, row.right); got != row.equal {
				t.Fatalf("sameJSONDocument() = %v, want %v", got, row.equal)
			}
		})
	}
}
