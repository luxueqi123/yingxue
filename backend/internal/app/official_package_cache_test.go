package app

import (
	"bytes"
	"crypto/sha256"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"

	"infinite-canvas/backend/internal/protocol"
)

func officialCacheFixture(t *testing.T, id string) []byte {
	t.Helper()
	return testPluginPackage(t, []byte(`{"apiVersion":"yingce.plugin/v1","id":"`+id+`","name":"Cache fixture","version":"1.0.0","contributes":{"commands":[{"id":"`+id+`/open","label":"Open"}]}}`))
}

func TestOfficialPackageCacheMatchesParserAndIsolatesMutations(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "openai-images.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	want, err := protocol.ParsePluginPackage(data)
	if err != nil {
		t.Fatal(err)
	}
	cache := officialPackageCache{maxEntries: 2, maxBytes: 1 << 20}
	for i := 0; i < 3; i++ {
		got, err := cache.parse(data)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatal("cached package differs from full validation")
		}
		got.Manifest.Metadata.Name = "changed"
		got.ManifestRaw[0] = '!'
		for _, body := range got.Files {
			if len(body) > 0 {
				body[0] = '!'
			}
		}
		delete(got.Files, "manifest.json")
	}
	if len(cache.entries) != 1 {
		t.Fatalf("cache entries = %d, want one content identity", len(cache.entries))
	}
}

func TestOfficialPackageCacheContentAddressingAndInvalidPackages(t *testing.T) {
	cache := officialPackageCache{maxEntries: 4, maxBytes: 1 << 20}
	first, second := officialCacheFixture(t, "one"), officialCacheFixture(t, "two")
	for _, data := range [][]byte{first, second} {
		got, err := cache.parse(data)
		if err != nil {
			t.Fatal(err)
		}
		want, _ := protocol.ParsePluginPackage(data)
		if !reflect.DeepEqual(got, want) {
			t.Fatal("changed content reused another manifest")
		}
	}
	corrupt := bytes.Clone(first)
	corrupt[len(corrupt)/2] ^= 0xff
	for _, data := range [][]byte{nil, []byte("not a zip"), corrupt, first[:len(first)/2]} {
		if _, err := cache.parse(data); err == nil {
			t.Fatal("invalid package accepted")
		}
	}
	if len(cache.entries) != 2 {
		t.Fatal("invalid packages entered cache")
	}
}

func TestOfficialPackageCacheEvictsByEntryAndByteLimits(t *testing.T) {
	first, second, third := officialCacheFixture(t, "one"), officialCacheFixture(t, "two"), officialCacheFixture(t, "three")
	cache := officialPackageCache{maxEntries: 2, maxBytes: 1 << 20}
	for _, data := range [][]byte{first, second, first, third} {
		if _, err := cache.parse(data); err != nil {
			t.Fatal(err)
		}
	}
	if len(cache.entries) != 2 || cache.entries[sha256.Sum256(second)] != nil || cache.entries[sha256.Sum256(first)] == nil {
		t.Fatal("LRU eviction did not retain recently used content")
	}
	small := officialPackageCache{maxEntries: 2, maxBytes: 1}
	if _, err := small.parse(first); err != nil {
		t.Fatal(err)
	}
	if len(small.entries) != 0 || small.bytes != 0 {
		t.Fatal("oversized package retained")
	}
	budget := officialPackageCache{maxEntries: 4, maxBytes: cache.bytes - 1}
	for _, data := range [][]byte{first, second, third} {
		if _, err := budget.parse(data); err != nil {
			t.Fatal(err)
		}
		if budget.bytes > budget.maxBytes {
			t.Fatal("byte budget exceeded")
		}
	}
}

func TestOfficialPackageCacheConcurrentReadersAreIndependent(t *testing.T) {
	data := officialCacheFixture(t, "parallel")
	cache := officialPackageCache{maxEntries: 2, maxBytes: 1 << 20}
	var group sync.WaitGroup
	for i := 0; i < 12; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			pkg, err := cache.parse(data)
			if err != nil {
				t.Error(err)
				return
			}
			if pkg.Manifest.Metadata.ID != "parallel" {
				t.Error("reader saw changed manifest")
			}
			pkg.Manifest.Contributes.Commands[0].Label = "changed"
			pkg.Files["manifest.json"][0] = '!'
		}()
	}
	group.Wait()
	pkg, err := cache.parse(data)
	if err != nil {
		t.Fatal(err)
	}
	if pkg.Manifest.Contributes.Commands[0].Label != "Open" || pkg.Files["manifest.json"][0] != '{' {
		t.Fatal("cache was mutated by a reader")
	}
}
