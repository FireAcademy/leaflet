package main

import (
	"log"
	"time"
	"net/http"
	"github.com/chia-network/go-chia-libs/pkg/rpc"
	"github.com/chia-network/go-chia-libs/pkg/rpcinterface"
)

var client *rpc.Client

func DoRPCRequest(endpoint string, body interface{}) (*http.Response, error) {
	req, err := client.NewRequest(
		rpcinterface.ServiceFullNode,
		"get_blockchain_state",
		nil,
	)
	if err != nil {
		log.Print(err)
		return nil, err
	}

	res, err := client.Do(req, nil)
	if err != nil {
		log.Print(err)
		return nil, err
	}

	return res, nil
}

func Setup() {
	var err error
	client, err = rpc.NewClient(
		rpc.ConnectionModeHTTP,
		rpc.WithAutoConfig(),
		rpc.WithCache(60 * time.Second),
	)

	if err != nil {
		log.Print(err)
		panic(err)
	}
}