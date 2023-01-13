package main

import (
	"log"
	"time"
	"bytes"
	"net/http"
	"github.com/chia-network/go-chia-libs/pkg/rpc"
	"github.com/chia-network/go-chia-libs/pkg/rpcinterface"
)

var client *rpc.Client

func DoRPCRequest(method string, endpoint string, body string) (*http.Response, error) {
	req, err := client.NewRequest(
		rpcinterface.ServiceFullNode,
		rpcinterface.Endpoint(endpoint),
		nil,
	)
	if err != nil {
		log.Print(err)
		return nil, err
	}

	req.Request, err = http.NewRequest(
		method,
		req.Request.URL.String(),
		bytes.NewReader([]byte(body)),
	)
	if err != nil {
		log.Print(err)
		return nil, err
	}

	reqHeaders := make(http.Header)
	reqHeaders.Set("Accept", "application/json")
	reqHeaders.Set("Content-Type", "application/json")
	for k, v := range reqHeaders {
		req.Request.Header[k] = v
	}

	res, err := client.Do(req, nil)
	if err != nil {
		log.Print(err)
		return nil, err
	}

	return res, nil
}

func IsReady() bool {
	resp, _, err := client.FullNodeService.GetBlockchainState()
	if err != nil || resp == nil {
		log.Print(err)
		return false
	}

	blockchain_state, ok := resp.BlockchainState.Get()
	if !ok {
		return false
	}

	return blockchain_state.Sync.Synced
}

func SetupRPCClient() {
	var err error
	client, err = rpc.NewClient(
		rpc.ConnectionModeHTTP,
		rpc.WithAutoConfig(),
		rpc.WithCache(5 * time.Second),
	)

	if err != nil {
		log.Print(err)
		panic(err)
	}
}