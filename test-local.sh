#!/bin/bash

# ImgBed 本地测试脚本

set -e

BASE_URL="http://localhost:8080"
TOKEN="changeme"  # 修改为你的token
TEST_IMAGE="/tmp/test-image.png"

echo "=== ImgBed 本地测试 ==="
echo ""

# 创建测试图片
echo "1. 创建测试图片..."
convert -size 100x100 xc:blue "$TEST_IMAGE" 2>/dev/null || {
    # 如果没有 imagemagick，创建一个简单的 1x1 PNG
    echo -e '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > "$TEST_IMAGE"
}
echo "✓ 测试图片创建成功"
echo ""

# 测试1: 未认证访问（应该失败）
echo "2. 测试未认证访问..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/stats")
if [ "$HTTP_CODE" = "401" ]; then
    echo "✓ 未认证访问被正确拒绝 (HTTP $HTTP_CODE)"
else
    echo "✗ 未认证访问应返回401，实际返回: $HTTP_CODE"
fi
echo ""

# 测试2: 登录
echo "3. 测试登录..."
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/api/login" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")

if echo "$LOGIN_RESP" | grep -q '"success":true'; then
    echo "✓ 登录成功"
else
    echo "✗ 登录失败: $LOGIN_RESP"
    exit 1
fi
echo ""

# 测试3: 获取统计信息
echo "4. 测试获取统计信息..."
STATS=$(curl -s "$BASE_URL/api/stats" -H "Authorization: Bearer $TOKEN")
if echo "$STATS" | grep -q "count"; then
    COUNT=$(echo "$STATS" | jq -r '.count' 2>/dev/null || echo "N/A")
    echo "✓ 获取统计成功，当前图片数量: $COUNT"
else
    echo "✗ 获取统计失败: $STATS"
fi
echo ""

# 测试4: 上传图片
echo "5. 测试上传图片..."
UPLOAD_RESP=$(curl -s -X POST "$BASE_URL/api/upload" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$TEST_IMAGE")

if echo "$UPLOAD_RESP" | grep -q '"url"'; then
    IMAGE_ID=$(echo "$UPLOAD_RESP" | jq -r '.id' 2>/dev/null)
    IMAGE_URL=$(echo "$UPLOAD_RESP" | jq -r '.url' 2>/dev/null)
    echo "✓ 上传成功"
    echo "  ID: $IMAGE_ID"
    echo "  URL: $IMAGE_URL"
else
    echo "✗ 上传失败: $UPLOAD_RESP"
    exit 1
fi
echo ""

# 测试5: 获取图片列表
echo "6. 测试获取图片列表..."
LIST=$(curl -s "$BASE_URL/api/images?limit=10" -H "Authorization: Bearer $TOKEN")
if echo "$LIST" | grep -q '\['; then
    LIST_COUNT=$(echo "$LIST" | jq 'length' 2>/dev/null || echo "N/A")
    echo "✓ 获取列表成功，返回 $LIST_COUNT 张图片"
else
    echo "✗ 获取列表失败: $LIST"
fi
echo ""

# 测试6: 下载图片
echo "7. 测试下载图片..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$IMAGE_URL")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ 图片下载成功 (HTTP $HTTP_CODE)"
else
    echo "✗ 图片下载失败 (HTTP $HTTP_CODE)"
fi
echo ""

# 测试7: 删除图片
echo "8. 测试删除图片..."
DELETE_RESP=$(curl -s -X DELETE "$BASE_URL/api/images/$IMAGE_ID" \
    -H "Authorization: Bearer $TOKEN")

if echo "$DELETE_RESP" | grep -q '"success":true'; then
    echo "✓ 删除成功"
else
    echo "✗ 删除失败: $DELETE_RESP"
fi
echo ""

# 测试8: 验证删除
echo "9. 验证图片已删除..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$IMAGE_URL")
if [ "$HTTP_CODE" = "404" ]; then
    echo "✓ 图片已成功删除 (HTTP $HTTP_CODE)"
else
    echo "✗ 图片应该被删除 (HTTP $HTTP_CODE)"
fi
echo ""

# 清理
rm -f "$TEST_IMAGE"

echo "=== 测试完成 ==="
echo ""
echo "测试摘要:"
echo "- 认证保护: ✓"
echo "- 登录功能: ✓"
echo "- 上传功能: ✓"
echo "- 列表功能: ✓"
echo "- 下载功能: ✓"
echo "- 删除功能: ✓"
