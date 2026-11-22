package app

import (
	"context"
	"encoding/binary"
	"io"
	"net"
	"strings"
	"testing"

	"golang.org/x/net/dns/dnsmessage"
)

// The package's tests run sequentially. Scope an in-memory resolver to each
// fixture so production URL validation still runs without external DNS.
func usePublicTestDNS(t *testing.T, hosts ...string) {
	t.Helper()
	allowed := make(map[string]bool, len(hosts))
	for _, host := range hosts {
		allowed[strings.ToLower(host)] = true
	}
	previous := net.DefaultResolver
	net.DefaultResolver = &net.Resolver{PreferGo: true, Dial: func(context.Context, string, string) (net.Conn, error) {
		client, server := net.Pipe()
		go func() {
			defer server.Close()
			var size [2]byte
			if _, err := io.ReadFull(server, size[:]); err != nil {
				return
			}
			packet := make([]byte, binary.BigEndian.Uint16(size[:]))
			if _, err := io.ReadFull(server, packet); err != nil {
				return
			}
			var query dnsmessage.Message
			if query.Unpack(packet) != nil {
				return
			}
			response := dnsmessage.Message{Header: dnsmessage.Header{ID: query.Header.ID, Response: true, RecursionAvailable: true}, Questions: query.Questions}
			for _, question := range query.Questions {
				if !allowed[strings.TrimSuffix(strings.ToLower(question.Name.String()), ".")] {
					response.Header.RCode = dnsmessage.RCodeNameError
					continue
				}
				if question.Type == dnsmessage.TypeA {
					response.Answers = append(response.Answers, dnsmessage.Resource{Header: dnsmessage.ResourceHeader{Name: question.Name, Type: dnsmessage.TypeA, Class: dnsmessage.ClassINET, TTL: 60}, Body: &dnsmessage.AResource{A: [4]byte{8, 8, 8, 8}}})
				}
			}
			data, err := response.Pack()
			if err != nil {
				return
			}
			binary.BigEndian.PutUint16(size[:], uint16(len(data)))
			_, _ = server.Write(append(size[:], data...))
		}()
		return client, nil
	}}
	t.Cleanup(func() { net.DefaultResolver = previous })
}
