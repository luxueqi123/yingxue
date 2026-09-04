package main

import (
	"net/http"
	"os"
	"time"

	paymentplugins "infinite-canvas/backend/payment-plugins"
)

func main() {
	provider := paymentplugins.NewCloudCatEPayProvider(&http.Client{Timeout: 20 * time.Second})
	if err := paymentplugins.RunRPC(provider, os.Stdin, os.Stdout); err != nil {
		os.Exit(1)
	}
}
