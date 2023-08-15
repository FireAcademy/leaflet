FROM ghcr.io/chia-network/chia:1.8.2

ENV service="node"
ENV upnp="true"
ENV healthcheck="false"
ENV log_level="DEBUG"

RUN DEBIAN_FRONTEND=noninteractive apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y \
    wget tar git

RUN cd /tmp && \
	wget --no-verbose --show-progress --progress=bar:force:noscroll https://storage.googleapis.com/golang/go1.19.5.linux-amd64.tar.gz -O go.tar.gz && \
	tar -C /usr/local -xzvf go.tar.gz

ENV PATH="$PATH:/usr/local/go/bin"

WORKDIR /tmp/leaflet

COPY go.mod go.sum ./

RUN go mod download
RUN go mod verify

COPY *.go ./

ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64
RUN go build -v -o /leaflet .

COPY start.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/start.sh

CMD ["start.sh"]
