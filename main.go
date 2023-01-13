package main

import (
	"fmt"
	"log"
	"time"
	"github.com/chia-network/go-chia-libs/pkg/rpc"
	"github.com/chia-network/go-chia-libs/pkg/rpcinterface"
)

func main() {
	client, err := rpc.NewClient(
		rpc.ConnectionModeHTTP,
		rpc.WithAutoConfig(),
		rpc.WithCache(60 * time.Second),
	)
	if err != nil {
		log.Print(err)
	}

	req, err := client.NewRequest(
		rpcinterface.ServiceFullNode,
		"get_blockchain_state",
		nil,
	)
	if err != nil {
		log.Print(err)
	}

	res, err := client.Do(req, nil)
	if err != nil {
		log.Print(err)
	}

	fmt.Println(res)
}