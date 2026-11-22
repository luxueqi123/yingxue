package model

import (
	"errors"
	"math/big"
)

const GPT6TokenPricingPolicy = "gpt-6-astra-2026-09-v1"

// PolicyTokenAmount uses the immutable order prices and one final ceiling, without intermediate overflow.
func PolicyTokenAmount(order BillingOrder, input, output, cached, write int64) (int64, error) {
	if order.TokenPricingPolicy != GPT6TokenPricingPolicy || input < 0 || output < 0 || cached < 0 || write < 0 || cached > input || write > input-cached || order.InputTokenPriceMicrocredits < 0 || order.OutputTokenPriceMicrocredits < 0 || order.CachedTokenPriceMicrocredits < 0 || order.MultiplierBasisPoints <= 0 {
		return 0, errors.New("invalid token pricing policy or usage")
	}
	inputFactor, outputFactor := int64(4), int64(4)
	if input > 272000 {
		inputFactor, outputFactor = 8, 6
	}
	total := new(big.Int)
	add := func(tokens, price, factor int64) {
		term := new(big.Int).Mul(big.NewInt(tokens), big.NewInt(price))
		total.Add(total, term.Mul(term, big.NewInt(factor)))
	}
	add(input-cached-write, order.InputTokenPriceMicrocredits, inputFactor)
	add(cached, order.CachedTokenPriceMicrocredits, inputFactor)
	add(write, order.InputTokenPriceMicrocredits, inputFactor*5/4)
	add(output, order.OutputTokenPriceMicrocredits, outputFactor)
	total.Mul(total, big.NewInt(order.MultiplierBasisPoints))
	divisor := big.NewInt(40000000000)
	total.Add(total, new(big.Int).Sub(divisor, big.NewInt(1)))
	total.Quo(total, divisor)
	if !total.IsInt64() {
		return 0, errors.New("token amount exceeds integer range")
	}
	return total.Int64(), nil
}
