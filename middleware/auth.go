package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

func Auth(token string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		auth := c.Get("Authorization")
		if auth == "" {
			return c.Status(401).JSON(fiber.Map{"error": "missing authorization header"})
		}

		parts := strings.SplitN(auth, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			return c.Status(401).JSON(fiber.Map{"error": "invalid authorization format"})
		}

		if parts[1] != token {
			return c.Status(403).JSON(fiber.Map{"error": "invalid token"})
		}

		return c.Next()
	}
}
