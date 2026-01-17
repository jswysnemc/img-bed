package storage

import (
	"database/sql"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type Image struct {
	ID           string    `json:"id"`
	Filename     string    `json:"filename"`
	OriginalName string    `json:"original_name"`
	Size         int64     `json:"size"`
	MimeType     string    `json:"mime_type"`
	CreatedAt    time.Time `json:"created_at"`
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
		size INTEGER NOT NULL,
		mime_type TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_created_at ON images(created_at DESC);
	`
	_, err := db.conn.Exec(query)
	if err != nil {
		return err
	}

	// 添加 original_name 列（如果不存在）
	db.conn.Exec("ALTER TABLE images ADD COLUMN original_name TEXT DEFAULT ''")
	return nil
}

func (db *DB) SaveImage(img *Image) error {
	_, err := db.conn.Exec(
		"INSERT INTO images (id, filename, original_name, size, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		img.ID, img.Filename, img.OriginalName, img.Size, img.MimeType, img.CreatedAt,
	)
	return err
}

func (db *DB) GetImage(id string) (*Image, error) {
	img := &Image{}
	err := db.conn.QueryRow(
		"SELECT id, filename, COALESCE(original_name, '') as original_name, size, mime_type, created_at FROM images WHERE id = ?",
		id,
	).Scan(&img.ID, &img.Filename, &img.OriginalName, &img.Size, &img.MimeType, &img.CreatedAt)
	if err != nil {
		return nil, err
	}
	return img, nil
}

func (db *DB) ListImages(limit, offset int) ([]Image, error) {
	rows, err := db.conn.Query(
		"SELECT id, filename, COALESCE(original_name, '') as original_name, size, mime_type, created_at FROM images ORDER BY created_at DESC LIMIT ? OFFSET ?",
		limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var images []Image
	for rows.Next() {
		var img Image
		if err := rows.Scan(&img.ID, &img.Filename, &img.OriginalName, &img.Size, &img.MimeType, &img.CreatedAt); err != nil {
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
