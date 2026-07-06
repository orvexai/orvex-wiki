package smoke

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/url"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/redis/go-redis/v9"
)

// opTimeout bounds every external call with a context deadline (CS §10). The
// suite talks only to local, prod-parity engines, so a single generous ceiling
// is sufficient — its job is to turn a hung/unreachable dependency into a fast,
// loud failure rather than an indefinite wait.
const opTimeout = 15 * time.Second

// requireEnv returns the value of key, or FAILS the test (it never skips) when
// the variable is unset or empty, naming the exact variable. This is the
// FAIL-never-SKIP contract for missing configuration: config comes from the
// environment ONLY (the Makefile sources .env.dev; strict mode uses pre-set
// env) — nothing here parses a .env file.
func requireEnv(t *testing.T, key string) string {
	t.Helper()
	v := os.Getenv(key)
	if v == "" {
		t.Fatalf("required environment variable %s is unset or empty; "+
			"source it first (local: `set -a && . ./.env.dev && set +a`)", key)
	}
	return v
}

// requireBool reads a mandatory boolean env var, failing hard on absence or on
// an unparseable value.
func requireBool(t *testing.T, key string) bool {
	t.Helper()
	raw := requireEnv(t, key)
	v, err := strconv.ParseBool(raw)
	if err != nil {
		t.Fatalf("environment variable %s=%q is not a valid boolean: %v", key, raw, err)
	}
	return v
}

// opContext derives a per-call context carrying the standard deadline (CS §10)
// and registers its cancellation with the test so no goroutine leaks.
func opContext(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), opTimeout)
	t.Cleanup(cancel)
	return ctx
}

// randToken returns a short random hex token used to namespace side-effecting
// keys/objects so concurrent or repeated runs never collide.
func randToken(t *testing.T) string {
	t.Helper()
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		t.Fatalf("could not generate random token: %v", err)
	}
	return hex.EncodeToString(b)
}

// redact blanks the userinfo password of a URL so a connection error can name
// the exact host/database without leaking the secret into test logs.
func redact(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return "<unparseable-url>"
	}
	if u.User != nil {
		if _, hasPassword := u.User.Password(); hasPassword {
			u.User = url.UserPassword(u.User.Username(), "xxxxx")
		}
	}
	return u.String()
}

// connectPostgres opens a single pgx connection from DATABASE_URL, bounding the
// dial with a context deadline (CS §10). It FAILS hard (never skips) when the
// var is missing or the engine is unreachable, naming the redacted address and
// the underlying error. The connection is closed via t.Cleanup.
func connectPostgres(t *testing.T) *pgx.Conn {
	t.Helper()
	dsn := requireEnv(t, "DATABASE_URL")

	ctx, cancel := context.WithTimeout(context.Background(), opTimeout)
	defer cancel()

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("postgres: connect to %s failed: %v", redact(dsn), err)
	}
	t.Cleanup(func() {
		closeCtx, closeCancel := context.WithTimeout(context.Background(), opTimeout)
		defer closeCancel()
		_ = conn.Close(closeCtx)
	})
	return conn
}

// connectRedis builds a go-redis client from REDIS_URL (which carries the AUTH
// password). ParseURL/NewClient do not dial — the first command does — so
// connectivity is proven by the caller's PING/round-trip under a deadline. It
// FAILS hard on a missing or unparseable URL.
func connectRedis(t *testing.T) *redis.Client {
	t.Helper()
	raw := requireEnv(t, "REDIS_URL")

	opts, err := redis.ParseURL(raw)
	if err != nil {
		t.Fatalf("redis: parse REDIS_URL %s failed: %v", redact(raw), err)
	}
	client := redis.NewClient(opts)
	t.Cleanup(func() { _ = client.Close() })
	return client
}

// newS3Client builds a MinIO/S3 client from the AWS_S3_* environment, honouring
// AWS_S3_FORCE_PATH_STYLE. minio.New does not dial — the first request does —
// so connectivity is proven by the caller's HeadBucket / round-trip under a
// deadline. It FAILS hard on any missing/invalid var. Returns the client and
// the target bucket.
func newS3Client(t *testing.T) (*minio.Client, string) {
	t.Helper()
	endpoint := requireEnv(t, "AWS_S3_ENDPOINT")
	accessKey := requireEnv(t, "AWS_S3_ACCESS_KEY_ID")
	secretKey := requireEnv(t, "AWS_S3_SECRET_ACCESS_KEY")
	bucket := requireEnv(t, "AWS_S3_BUCKET")
	forcePathStyle := requireBool(t, "AWS_S3_FORCE_PATH_STYLE")

	u, err := url.Parse(endpoint)
	if err != nil {
		t.Fatalf("s3: parse AWS_S3_ENDPOINT %q failed: %v", endpoint, err)
	}
	if u.Host == "" {
		t.Fatalf("s3: AWS_S3_ENDPOINT %q has no host:port component", endpoint)
	}

	lookup := minio.BucketLookupAuto
	if forcePathStyle {
		lookup = minio.BucketLookupPath
	}

	client, err := minio.New(u.Host, &minio.Options{
		Creds:        credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure:       strings.EqualFold(u.Scheme, "https"),
		BucketLookup: lookup,
		Region:       os.Getenv("AWS_S3_REGION"), // optional; empty is fine for MinIO
	})
	if err != nil {
		t.Fatalf("s3: build client for endpoint %s (bucket %q) failed: %v", endpoint, bucket, err)
	}
	return client, bucket
}
