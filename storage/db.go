package storage

import (
	"database/sql"
	"fmt"
	"strconv"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type Image struct {
	ID           string    `json:"id"`
	Filename     string    `json:"filename"`
	OriginalName string    `json:"original_name"`
	Hash         string    `json:"hash"`
	Size         int64     `json:"size"`
	MimeType     string    `json:"mime_type"`
	CreatedAt    time.Time `json:"created_at"`
}

type Config struct {
	EnableCompression bool  `json:"enable_compression"`
	MaxWidth          int   `json:"max_width"`
	JpegQuality       int   `json:"jpeg_quality"`
	MaxSize           int64 `json:"max_size"` // in bytes
}

type DB struct {
	conn *sql.DB
}

func NewDB(path string) (*DB, error) {
	conn, err := sql.Open("sqlite3", path+"?_journal_mode=WAL")
	if err != nil {
		return nil, err
	}

	if err := conn.Ping(); err != nil {
		return nil, err
	}

	db := &DB{conn: conn}
	if err := db.migrate(); err != nil {
		return nil, err
	}

	return db, nil
}

func (db *DB) migrate() error {
	query := `
	CREATE TABLE IF NOT EXISTS images (
		id TEXT PRIMARY KEY,
		filename TEXT NOT NULL,
		original_name TEXT DEFAULT '',
		hash TEXT DEFAULT '',
		size INTEGER NOT NULL,
		mime_type TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_created_at ON images(created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_hash ON images(hash);

	CREATE TABLE IF NOT EXISTS config (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);
	`
	_, err := db.conn.Exec(query)
	if err != nil {
		return err
	}

	// 添加 original_name 列（如果不存在）
	db.conn.Exec("ALTER TABLE images ADD COLUMN original_name TEXT DEFAULT ''")
	// 添加 hash 列（如果不存在）
	db.conn.Exec("ALTER TABLE images ADD COLUMN hash TEXT DEFAULT ''")

	// 初始化默认配置（如果不存在）
	db.initDefaultConfig()

	return nil
}

func (db *DB) SaveImage(img *Image) error {
	_, err := db.conn.Exec(
		"INSERT INTO images (id, filename, original_name, hash, size, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		img.ID, img.Filename, img.OriginalName, img.Hash, img.Size, img.MimeType, img.CreatedAt,
	)
	return err
}

func (db *DB) GetImage(id string) (*Image, error) {
	img := &Image{}
	err := db.conn.QueryRow(
		"SELECT id, filename, COALESCE(original_name, '') as original_name, COALESCE(hash, '') as hash, size, mime_type, created_at FROM images WHERE id = ?",
		id,
	).Scan(&img.ID, &img.Filename, &img.OriginalName, &img.Hash, &img.Size, &img.MimeType, &img.CreatedAt)
	if err != nil {
		return nil, err
	}
	return img, nil
}

func (db *DB) GetImageByHash(hash string) (*Image, error) {
	img := &Image{}
	err := db.conn.QueryRow(
		"SELECT id, filename, COALESCE(original_name, '') as original_name, COALESCE(hash, '') as hash, size, mime_type, created_at FROM images WHERE hash = ? LIMIT 1",
		hash,
	).Scan(&img.ID, &img.Filename, &img.OriginalName, &img.Hash, &img.Size, &img.MimeType, &img.CreatedAt)
	if err != nil {
		return nil, err
	}
	return img, nil
}

func (db *DB) ListImages(limit, offset int) ([]Image, error) {
	rows, err := db.conn.Query(
		"SELECT id, filename, COALESCE(original_name, '') as original_name, COALESCE(hash, '') as hash, size, mime_type, created_at FROM images ORDER BY created_at DESC LIMIT ? OFFSET ?",
		limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var images []Image
	for rows.Next() {
		var img Image
		if err := rows.Scan(&img.ID, &img.Filename, &img.OriginalName, &img.Hash, &img.Size, &img.MimeType, &img.CreatedAt); err != nil {
			return nil, err
		}
		images = append(images, img)
	}
	return images, nil
}

func (db *DB) DeleteImage(id string) error {
	_, err := db.conn.Exec("DELETE FROM images WHERE id = ?", id)
	return err
}

func (db *DB) Count() (int64, error) {
	var count int64
	err := db.conn.QueryRow("SELECT COUNT(*) FROM images").Scan(&count)
	return count, err
}

func (db *DB) TotalSize() (int64, error) {
	var size sql.NullInt64
	err := db.conn.QueryRow("SELECT SUM(size) FROM images").Scan(&size)
	if err != nil {
		return 0, err
	}
	return size.Int64, nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}

// Config methods
func (db *DB) initDefaultConfig() {
	defaults := map[string]string{
		"enable_compression": "true",
		"max_width":          "1920",
		"jpeg_quality":       "85",
		"max_size":           "52428800", // 50MB in bytes
	}

	for key, value := range defaults {
		db.conn.Exec("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)", key, value)
	}
}

func (db *DB) GetConfig() (*Config, error) {
	rows, err := db.conn.Query("SELECT key, value FROM config")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cfg := &Config{
		EnableCompression: true,
		MaxWidth:          1920,
		JpegQuality:       85,
		MaxSize:           50 * 1024 * 1024, // 50MB
	}

	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			continue
		}

		switch key {
		case "enable_compression":
			cfg.EnableCompression = value == "true"
		case "max_width":
			if v, err := strconv.Atoi(value); err == nil {
				cfg.MaxWidth = v
			}
		case "jpeg_quality":
			if v, err := strconv.Atoi(value); err == nil {
				cfg.JpegQuality = v
			}
		case "max_size":
			if v, err := strconv.ParseInt(value, 10, 64); err == nil {
				cfg.MaxSize = v
			}
		}
	}

	return cfg, nil
}

func (db *DB) UpdateConfig(cfg *Config) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	updates := map[string]string{
		"enable_compression": "false",
		"max_width":          fmt.Sprintf("%d", cfg.MaxWidth),
		"jpeg_quality":       fmt.Sprintf("%d", cfg.JpegQuality),
		"max_size":           fmt.Sprintf("%d", cfg.MaxSize),
	}

	if cfg.EnableCompression {
		updates["enable_compression"] = "true"
	}

	for key, value := range updates {
		_, err := tx.Exec("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", key, value)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}
