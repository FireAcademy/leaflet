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

func main() {
	SetupRPCClient()

	app := fiber.New()

    app.Get("/", Index)

    port := getPort()
    log.Fatalln(app.Listen(fmt.Sprintf(":%v", port)))
}