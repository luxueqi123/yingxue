package app

import (
	"bytes"
	"container/list"
	"crypto/sha256"
	"encoding/json"
	"sync"

	"infinite-canvas/backend/internal/protocol"
)

// Only trusted bundled-package call sites use this cache. User uploads still
// pass directly through the package validator and cannot populate it.
var officialPackages = officialPackageCache{maxEntries: 128, maxBytes: 256 << 20}

type officialPackageCache struct {
	mu         sync.Mutex
	maxEntries int
	maxBytes   int64
	bytes      int64
	entries    map[[32]byte]*list.Element
	order      list.List
}

type officialPackageCacheEntry struct {
	digest [32]byte
	pkg    protocol.PluginPackage
	bytes  int64
}

func (c *officialPackageCache) parse(data []byte) (protocol.PluginPackage, error) {
	// Retain the parser's size rejection before hashing or accessing the cache.
	if len(data) == 0 || len(data) > protocol.PluginPackageMaxBytes {
		return protocol.ParsePluginPackage(data)
	}
	digest := sha256.Sum256(data)
	c.mu.Lock()
	if entry := c.entries[digest]; entry != nil {
		c.order.MoveToFront(entry)
		pkg := entry.Value.(officialPackageCacheEntry).pkg
		c.mu.Unlock()
		return cloneOfficialPackage(pkg)
	}
	// Serialize misses so simultaneous service initialization does not inflate
	// the same large payment binary once per waiting runtime.
	pkg, err := protocol.ParsePluginPackage(data)
	if err != nil {
		c.mu.Unlock()
		return protocol.PluginPackage{}, err
	}
	size := int64(len(pkg.ManifestRaw))
	for name, content := range pkg.Files {
		size += int64(len(name)) + int64(len(content))
	}
	if c.maxEntries <= 0 || size > c.maxBytes {
		c.mu.Unlock()
		return pkg, nil
	}
	if c.entries == nil {
		c.entries = make(map[[32]byte]*list.Element)
	}
	for len(c.entries) >= c.maxEntries || c.bytes+size > c.maxBytes {
		oldest := c.order.Back()
		entry := oldest.Value.(officialPackageCacheEntry)
		delete(c.entries, entry.digest)
		c.bytes -= entry.bytes
		c.order.Remove(oldest)
	}
	c.entries[digest] = c.order.PushFront(officialPackageCacheEntry{digest: digest, pkg: pkg, bytes: size})
	c.bytes += size
	c.mu.Unlock()
	return cloneOfficialPackage(pkg)
}

func cloneOfficialPackage(pkg protocol.PluginPackage) (protocol.PluginPackage, error) {
	// Parsing the already validated manifest produces independent nested slices
	// and maps without repeating ZIP inflation or sharing mutable metadata.
	result := protocol.PluginPackage{ManifestRaw: bytes.Clone(pkg.ManifestRaw), Files: make(map[string][]byte, len(pkg.Files))}
	if err := json.Unmarshal(result.ManifestRaw, &result.Manifest); err != nil {
		return protocol.PluginPackage{}, err
	}
	for name, content := range pkg.Files {
		result.Files[name] = bytes.Clone(content)
	}
	return result, nil
}
