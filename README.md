# ImgBed

轻量级图床服务，使用 Go 语言编写。

## 特性

- 简洁优雅的 Web 管理面板
- Token 认证保护
- SQLite 数据库（无需外部依赖）
- 单文件二进制部署
- Docker 一键部署
- 低内存占用（约 15-30MB）
- 支持批量上传、多选删除
- 保留原始文件名
- 支持 Ctrl+V 粘贴上传
- 多种链接格式（直链、Markdown、HTML、BBCode）

## 快速开始

### Docker Compose（推荐）

1. 编辑 `docker-compose.yml` 设置你的 `AUTH_TOKEN`

2. 启动服务：

```bash
docker compose up -d
```

3. 访问 `http://localhost:8080`

### 手动编译

```bash
go build -o imgbed .
AUTH_TOKEN=your-secret-token ./imgbed
```

## 配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `PORT` | `8080` | 服务端口 |
| `AUTH_TOKEN` | `changeme` | 上传/删除认证令牌 |
| `UPLOAD_DIR` | `./data/uploads` | 图片存储目录 |
| `DB_PATH` | `./data/imgbed.db` | SQLite 数据库路径 |
| `BASE_URL` | (自动检测) | 图片链接的公开 URL 前缀 |
| `MAX_SIZE` | `10485760` | 最大文件大小（字节，默认 10MB） |

## API

### 上传图片

```bash
curl -X POST \
  -H "Authorization: Bearer your-token" \
  -F "file=@image.png" \
  http://localhost:8080/api/upload
```

响应：

```json
{
  "id": "a1b2c3d4e5f6",
  "url": "http://localhost:8080/i/a1b2c3d4e5f6.png",
  "filename": "a1b2c3d4e5f6.png",
  "original_name": "photo.png",
  "size": 12345
}
```

### 图片列表

```bash
curl http://localhost:8080/api/images?limit=50&offset=0
```

### 删除图片

```bash
curl -X DELETE \
  -H "Authorization: Bearer your-token" \
  http://localhost:8080/api/images/{id}
```

### 统计信息

```bash
curl http://localhost:8080/api/stats
```

## Typora 集成

创建上传脚本 `/usr/local/bin/imgbed-upload`：

```bash
#!/bin/bash

IMGBED_URL="http://your-server:8080"
IMGBED_TOKEN="your-token"

for file in "$@"; do
    result=$(curl -s -X POST \
        -H "Authorization: Bearer $IMGBED_TOKEN" \
        -F "file=@$file" \
        "$IMGBED_URL/api/upload")

    url=$(echo "$result" | jq -r '.url')
    echo "$url"
done
```

在 Typora 中设置：
- 偏好设置 > 图像 > 上传服务 > 自定义命令
- 命令：`/usr/local/bin/imgbed-upload`

## 支持格式

- JPEG (.jpg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)
- SVG (.svg)

## 技术栈

- [Fiber](https://github.com/gofiber/fiber) - 高性能 Web 框架
- [SQLite](https://www.sqlite.org/) - 嵌入式数据库
- 原生 HTML/CSS/JS 前端

## License

MIT
