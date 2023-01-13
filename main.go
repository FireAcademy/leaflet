package main

import (
	"os"
	"fmt"
	"log"
	"github.com/gofiber/fiber/v2"
)


func getPort() string {
    port := os.Getenv("LEAFLET_LISTEN_PORT")
   if port == "" {
       panic("LEAFLET_LISTEN_PORT not set")
   }

   return port
}

func Index(c *fiber.Ctx) error {
	return c.SendString("Leaflet server is running.")
}

func ReadinessCheck(c *fiber.Ctx) error {
	ready := IsReady()

	if ready {
		return c.SendString("OK")
	}

	return c.Status(400).SendString("NOT READY BRO")
}

func ProxyToRPCEndpoint(c *fiber.Ctx) error {
	endpoint := c.Params("endpoint")

	return c.SendString(c.Method() + "." + endpoint)
}

func main() {
	SetupRPCClient()

	app := fiber.New()

    app.Get("/", Index)
    app.Get("/ready", ReadinessCheck)
    app.Get("/endpoint/:endpoint", ProxyToRPCEndpoint)
    app.Post("/endpoint/:endpoint", ProxyToRPCEndpoint)

    port := getPort()
    log.Fatalln(app.Listen(fmt.Sprintf(":%v", port)))
}