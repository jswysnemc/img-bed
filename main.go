package main

import (
	"embed"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"img-bed/config"
	"img-bed/handler"
	"img-bed/middleware"
	"img-bed/storage"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/filesystem"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

//go:embed web/*
var webFS embed.FS

func main() {
	cfg := config.Load()

	if err := os.MkdirAll(cfg.UploadDir, 0755); err != nil {
		log.Fatal("Failed to create upload dir:", err)
	}

	db, err := storage.NewDB(cfg.DBPath)
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}
	defer db.Close()

	app := fiber.New(fiber.Config{
		BodyLimit:             int(cfg.MaxSize),
		DisableStartupMessage: true,
	})

	app.Use(recover.New())
	app.Use(logger.New(logger.Config{
		Format: "${time} ${status} ${method} ${path} ${latency}\n",
	}))

	h := handler.New(cfg, db)

	// API routes
	api := app.Group("/api")

	// Public login endpoint
	api.Post("/login", h.Login)

	// Public config endpoint
	api.Get("/config", h.GetConfig)

	// Protected routes - require authentication
	protected := api.Group("", middleware.Auth(cfg.AuthToken))
	protected.Get("/stats", h.Stats)
	protected.Get("/images", h.List)
	protected.Post("/upload", h.Upload)
	protected.Delete("/images/:id", h.Delete)
	protected.Put("/config", h.UpdateConfig)

	// Serve uploaded images
	app.Get("/i/:filename", h.GetImage)

	// Serve static files
	app.Use("/static", filesystem.New(filesystem.Config{
		Root:       http.FS(webFS),
		PathPrefix: "web",
	}))

	// Serve index.html
	app.Get("/", func(c *fiber.Ctx) error {
		data, _ := webFS.ReadFile("web/index.html")
		c.Set("Content-Type", "text/html")
		return c.Send(data)
	})

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("Shutting down...")
		app.Shutdown()
	}()

	// Print banner
	printBanner(cfg.Port)

	if err := app.Listen(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}

func printBanner(port string) {
	banner := `
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██╗███╗   ███╗ ██████╗ ██████╗ ███████╗██████╗        ║
║   ██║████╗ ████║██╔════╝ ██╔══██╗██╔════╝██╔══██╗       ║
║   ██║██╔████╔██║██║  ███╗██████╔╝█████╗  ██║  ██║       ║
║   ██║██║╚██╔╝██║██║   ██║██╔══██╗██╔══╝  ██║  ██║       ║
║   ██║██║ ╚═╝ ██║╚██████╔╝██████╔╝███████╗██████╔╝       ║
║   ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚═════╝        ║
║                                                           ║
║              轻量级图床服务 · Lightweight Image Host      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`
	fmt.Print(banner)
	fmt.Printf("\n  🚀 Server starting on http://localhost:%s\n", port)
	fmt.Printf("  📸 Ready to serve images\n\n")
}
