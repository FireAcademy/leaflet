#!/usr/bin/env bash

if [ -z ${FASTSYNC_CMD+x} ]; then
	echo "FastSync command not set";
else
	mkdir -p "$CHIA_ROOT/db";
	cd "$CHIA_ROOT/db";
	/bin/bash -c "${FASTSYNC_CMD}";
fi

# sed -i 's/max_inbound_wallet: 20/max_inbound_wallet: 420/g' "$CHIA_ROOT/config/config.yaml"
# sed -i 's/target_peer_count: 80/target_peer_count: 500/g' "$CHIA_ROOT/config/config.yaml"
chia start node

touch "$CHIA_ROOT/log/debug.log"

/leaflet

echo "Shutting down ..."
chia stop all -d