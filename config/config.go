package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port       string
	AuthToken  string
	UploadDir  string
	DBPath     string
	MaxSize    int64
	BaseURL    string
	// Image compression settings
	EnableCompression bool
	MaxWidth          int
	JpegQuality       int
}

func Load() *Config {
	cfg := &Config{
		Port:              getEnv("PORT", "8080"),
		AuthToken:         getEnv("AUTH_TOKEN", "changeme"),
		UploadDir:         getEnv("UPLOAD_DIR", "./data/uploads"),
		DBPath:            getEnv("DB_PATH", "./data/imgbed.db"),
		MaxSize:           50 * 1024 * 1024, // 50MB
		BaseURL:           getEnv("BASE_URL", ""),
		EnableCompression: getEnvBool("ENABLE_COMPRESSION", true),
		MaxWidth:          getEnvInt("MAX_WIDTH", 1920),
		JpegQuality:       getEnvInt("JPEG_QUALITY", 85),
	}
	return cfg
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		b, err := strconv.ParseBool(v)
		if err == nil {
			return b
		}
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		i, err := strconv.Atoi(v)
		if err == nil {
			return i
		}
	}
	return fallback
}
