package config

import (
	"os"
)

type Config struct {
	Port       string
	AuthToken  string
	UploadDir  string
	DBPath     string
	MaxSize    int64
	BaseURL    string
}

func Load() *Config {
	cfg := &Config{
		Port:      getEnv("PORT", "8080"),
		AuthToken: getEnv("AUTH_TOKEN", "changeme"),
		UploadDir: getEnv("UPLOAD_DIR", "./data/uploads"),
		DBPath:    getEnv("DB_PATH", "./data/imgbed.db"),
		MaxSize:   50 * 1024 * 1024, // 50MB
		BaseURL:   getEnv("BASE_URL", ""),
	}
	return cfg
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
