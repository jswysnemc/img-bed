package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"img-bed/config"
	"img-bed/storage"

	"github.com/disintegration/imaging"
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

	// Get max size from database config
	cfg, err := h.db.GetConfig()
	maxSize := h.cfg.MaxSize // fallback to env config
	if err == nil && cfg.MaxSize > 0 {
		maxSize = cfg.MaxSize
	}

	if file.Size > maxSize {
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

	// Save to temporary file first
	tmpPath := filepath.Join(h.cfg.UploadDir, ".tmp_"+filename)
	dstPath := filepath.Join(h.cfg.UploadDir, filename)

	tmpFile, err := os.Create(tmpPath)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to save file"})
	}

	if _, err := io.Copy(tmpFile, src); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return c.Status(500).JSON(fiber.Map{"error": "failed to save file"})
	}
	tmpFile.Close()

	// Compress/process the image
	if err := h.compressImage(tmpPath, dstPath, contentType); err != nil {
		os.Remove(tmpPath)
		os.Remove(dstPath)
		return c.Status(500).JSON(fiber.Map{"error": "failed to process image"})
	}

	// Remove temporary file
	os.Remove(tmpPath)

	// Get actual file size after compression
	fileInfo, err := os.Stat(dstPath)
	if err != nil {
		os.Remove(dstPath)
		return c.Status(500).JSON(fiber.Map{"error": "failed to get file info"})
	}
	actualSize := fileInfo.Size()

	img := &storage.Image{
		ID:           id,
		Filename:     filename,
		OriginalName: file.Filename,
		Hash:         fileHash,
		Size:         actualSize,
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
		"size":          actualSize,
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

func (h *Handler) GetConfig(c *fiber.Ctx) error {
	cfg, err := h.db.GetConfig()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to load config"})
	}

	return c.JSON(fiber.Map{
		"compression_enabled": cfg.EnableCompression,
		"max_width":           cfg.MaxWidth,
		"jpeg_quality":        cfg.JpegQuality,
		"max_size":            cfg.MaxSize,
	})
}

func (h *Handler) UpdateConfig(c *fiber.Ctx) error {
	var req storage.Config
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	// 验证参数
	if req.MaxWidth < 100 || req.MaxWidth > 10000 {
		return c.Status(400).JSON(fiber.Map{"error": "max_width must be between 100 and 10000"})
	}

	if req.JpegQuality < 1 || req.JpegQuality > 100 {
		return c.Status(400).JSON(fiber.Map{"error": "jpeg_quality must be between 1 and 100"})
	}

	if req.MaxSize < 1024*1024 || req.MaxSize > 100*1024*1024 {
		return c.Status(400).JSON(fiber.Map{"error": "max_size must be between 1MB and 100MB"})
	}

	if err := h.db.UpdateConfig(&req); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to update config"})
	}

	return c.JSON(fiber.Map{"success": true})
}

func generateID() string {
	b := make([]byte, 6)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// compressImage compresses and resizes the image if compression is enabled
func (h *Handler) compressImage(srcPath, dstPath, mimeType string) error {
	// Load config from database
	cfg, err := h.db.GetConfig()
	if err != nil || !cfg.EnableCompression {
		// If compression is disabled or error, just copy the file
		src, err := os.Open(srcPath)
		if err != nil {
			return err
		}
		defer src.Close()

		dst, err := os.Create(dstPath)
		if err != nil {
			return err
		}
		defer dst.Close()

		_, err = io.Copy(dst, src)
		return err
	}

	// Skip compression for GIF and SVG (preserve animation and vector format)
	if mimeType == "image/gif" || mimeType == "image/svg+xml" {
		src, err := os.Open(srcPath)
		if err != nil {
			return err
		}
		defer src.Close()

		dst, err := os.Create(dstPath)
		if err != nil {
			return err
		}
		defer dst.Close()

		_, err = io.Copy(dst, src)
		return err
	}

	// Open and decode the image
	src, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer src.Close()

	img, _, err := image.Decode(src)
	if err != nil {
		return err
	}

	// Resize if width exceeds max width
	bounds := img.Bounds()
	width := bounds.Dx()
	if width > cfg.MaxWidth {
		img = imaging.Resize(img, cfg.MaxWidth, 0, imaging.Lanczos)
	}

	// Create output file
	dst, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer dst.Close()

	// Encode with compression based on format
	switch mimeType {
	case "image/jpeg":
		return jpeg.Encode(dst, img, &jpeg.Options{Quality: cfg.JpegQuality})
	case "image/png":
		// PNG doesn't have quality setting, but re-encoding removes metadata
		return png.Encode(dst, img)
	case "image/webp":
		// For WebP, just re-encode (removes metadata)
		return png.Encode(dst, img)
	default:
		return fmt.Errorf("unsupported format for compression: %s", mimeType)
	}
}
