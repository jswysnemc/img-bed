# Build stage
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=1 go build -ldflags="-s -w" -o imgbed .

# Runtime stage
FROM alpine:3.19

RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder /app/imgbed .

RUN mkdir -p /app/data/uploads

ENV PORT=8080
ENV UPLOAD_DIR=/app/data/uploads
ENV DB_PATH=/app/data/imgbed.db

EXPOSE 8080

VOLUME ["/app/data"]

CMD ["./imgbed"]
