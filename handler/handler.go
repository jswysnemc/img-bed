package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"img-bed/config"
	"img-bed/storage"

	"github.com/gofiber/fiber/v2"
)

type Handler struct {
	cfg *config.Config
	db  *storage.DB
}

func New(cfg *config.Config, db *storage.DB) *Handler {
	return &Handler{cfg: cfg, db: db}
}

var allowedMimes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/gif":  ".gif",
	"image/webp": ".webp",
	"image/svg+xml": ".svg",
}

func (h *Handler) Upload(c *fiber.Ctx) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "no file provided"})
	}

	if file.Size > h.cfg.MaxSize {
		return c.Status(400).JSON(fiber.Map{"error": "file too large"})
	}

	contentType := file.Header.Get("Content-Type")
	ext, ok := allowedMimes[contentType]
	if !ok {
		return c.Status(400).JSON(fiber.Map{"error": "unsupported file type"})
	}

	// 打开文件计算 hash
	src, err := file.Open()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to read file"})
	}
	defer src.Close()

	// 计算 SHA256 hash
	hasher := sha256.New()
	if _, err := io.Copy(hasher, src); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to calculate hash"})
	}
	fileHash := hex.EncodeToString(hasher.Sum(nil))

	// 检查是否已存在相同 hash 的文件
	existingImg, err := h.db.GetImageByHash(fileHash)
	if err == nil && existingImg != nil {
		// 文件已存在，直接返回现有的 URL
		baseURL := h.cfg.BaseURL
		if baseURL == "" {
			baseURL = c.Protocol() + "://" + c.Hostname()
		}

		return c.JSON(fiber.Map{
			"id":            existingImg.ID,
			"url":           fmt.Sprintf("%s/i/%s", baseURL, existingImg.Filename),
			"filename":      existingImg.Filename,
			"original_name": file.Filename,
			"hash":          fileHash,
			"size":          file.Size,
			"duplicate":     true,
		})
	}

	// 重新打开文件进行保存
	src, err = file.Open()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to read file"})
	}
	defer src.Close()

	id := generateID()
	filename := id + ext

	dstPath := filepath.Join(h.cfg.UploadDir, filename)
	dst, err := os.Create(dstPath)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to save file"})
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		os.Remove(dstPath)
		return c.Status(500).JSON(fiber.Map{"error": "failed to save file"})
	}

	img := &storage.Image{
		ID:           id,
		Filename:     filename,
		OriginalName: file.Filename,
		Hash:         fileHash,
		Size:         file.Size,
		MimeType:     contentType,
		CreatedAt:    time.Now(),
	}

	if err := h.db.SaveImage(img); err != nil {
		os.Remove(dstPath)
		return c.Status(500).JSON(fiber.Map{"error": "failed to save metadata"})
	}

	baseURL := h.cfg.BaseURL
	if baseURL == "" {
		baseURL = c.Protocol() + "://" + c.Hostname()
	}

	return c.JSON(fiber.Map{
		"id":            id,
		"url":           fmt.Sprintf("%s/i/%s", baseURL, filename),
		"filename":      filename,
		"original_name": file.Filename,
		"hash":          fileHash,
		"size":          file.Size,
		"duplicate":     false,
	})
}

func (h *Handler) GetImage(c *fiber.Ctx) error {
	filename := c.Params("filename")
	if filename == "" {
		return c.Status(400).JSON(fiber.Map{"error": "missing filename"})
	}

	// 安全检查：防止路径穿越
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") {
		return c.Status(400).JSON(fiber.Map{"error": "invalid filename"})
	}

	filePath := filepath.Join(h.cfg.UploadDir, filename)

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return c.Status(404).JSON(fiber.Map{"error": "image not found"})
	}

	c.Set("Cache-Control", "public, max-age=31536000")
	return c.SendFile(filePath)
}

func (h *Handler) List(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 50)
	offset := c.QueryInt("offset", 0)

	if limit > 100 {
		limit = 100
	}

	images, err := h.db.ListImages(limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to list images"})
	}

	if images == nil {
		images = []storage.Image{}
	}

	return c.JSON(images)
}

func (h *Handler) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(400).JSON(fiber.Map{"error": "missing id"})
	}

	img, err := h.db.GetImage(id)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "image not found"})
	}

	filePath := filepath.Join(h.cfg.UploadDir, img.Filename)
	os.Remove(filePath)

	if err := h.db.DeleteImage(id); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to delete"})
	}

	return c.JSON(fiber.Map{"success": true})
}

func (h *Handler) Login(c *fiber.Ctx) error {
	var req struct {
		Token string `json:"token"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	if req.Token != h.cfg.AuthToken {
		return c.Status(401).JSON(fiber.Map{"error": "invalid token"})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"token":   req.Token,
	})
}

func (h *Handler) Stats(c *fiber.Ctx) error {
	count, _ := h.db.Count()
	size, _ := h.db.TotalSize()

	return c.JSON(fiber.Map{
		"count":      count,
		"total_size": size,
	})
}

func generateID() string {
	b := make([]byte, 6)
	rand.Read(b)
	return hex.EncodeToString(b)
}
